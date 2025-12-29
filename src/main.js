import { BatchManager } from './BatchManager.js';
import { renderSNRChart, renderAirUtilChart } from './ChartRenderer.js';
import { startTelemetryUpdates } from './TelemetrySimulator.js';
import { PacketRain } from './PacketRain.js';
import { createModal, showPrompt, showConfirm, showAlert, getElement, getValue } from './utils/DOMHelpers.js';

const manager = new BatchManager();

// Initialize Packet Rain
let packetRain = null;
const packetRainCanvas = document.getElementById('packetRainCanvas');
if (packetRainCanvas) {
    packetRain = new PacketRain(packetRainCanvas, manager.devices);
    packetRain.start();
    
    // Toggle button
    const toggleBtn = document.getElementById('packetRainToggle');
    if (toggleBtn) {
        toggleBtn.onclick = () => {
            packetRain.toggle();
            toggleBtn.textContent = packetRain.enabled ? 'Disable' : 'Enable';
        };
    }
}

// Make manager globally available for onclick handlers
window.manager = manager;
window.render = render;

// Board definitions (similar to Meshtastic flasher)
const BOARD_DEFINITIONS = [
    { id: 'tbeam', name: 'T-Beam', vendor: 'LilyGO', chip: 'esp32', icon: '📡' },
    { id: 'tbeam-s3-core', name: 'T-Beam S3', vendor: 'LilyGO', chip: 'esp32-s3', icon: '📡' },
    { id: 'tlora-v2', name: 'T-LoRa V2', vendor: 'LilyGO', chip: 'esp32', icon: '📻' },
    { id: 'tlora-t3s3-v1', name: 'T-LoRa T3S3', vendor: 'LilyGO', chip: 'esp32-s3', icon: '📻' },
    { id: 't-deck', name: 'T-Deck', vendor: 'LilyGO', chip: 'esp32-s3', icon: '⌨️' },
    { id: 'heltec-v3', name: 'Heltec V3', vendor: 'Heltec', chip: 'esp32', icon: '📡' },
    { id: 'heltec-v2', name: 'Heltec V2', vendor: 'Heltec', chip: 'esp32', icon: '📡' },
    { id: 'heltec-wireless-tracker', name: 'Wireless Tracker', vendor: 'Heltec', chip: 'esp32', icon: '📡' },
    { id: 'rak4631', name: 'RAK4631', vendor: 'RAK', chip: 'nrf52840', icon: '📡' },
    { id: 'rak11200', name: 'RAK11200', vendor: 'RAK', chip: 'esp32-s3', icon: '📡' },
    { id: 'seeed-xiao-esp32s3', name: 'Xiao ESP32-S3', vendor: 'Seeed', chip: 'esp32-s3', icon: '📡' },
];

let currentVendorFilter = 'all';
let currentChipFilter = 'all';

/**
 * @fileoverview Main UI controller for Batchtastic Pro
 * Handles device management, configuration, and firmware flashing UI
 */

// Board Selector Modal Functions
/**
 * Open the board selector modal
 */
window.openBoardSelector = function() {
    const modal = document.getElementById('boardSelectorModal');
    if (modal) {
        modal.style.display = 'flex';
        renderBoardGrid();
    }
};

/**
 * Close the board selector modal
 */
window.closeBoardSelector = function() {
    const modal = document.getElementById('boardSelectorModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

/**
 * Filter boards by vendor
 * @param {string} vendor - Vendor name to filter by ('all' for all vendors)
 */
window.filterBoards = function(vendor) {
    currentVendorFilter = vendor;
    document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-filter="${vendor}"]`)?.classList.add('active');
    renderBoardGrid();
};

/**
 * Filter boards by chip type
 * @param {string} chip - Chip type to filter by ('all' for all chips)
 */
window.filterChips = function(chip) {
    currentChipFilter = chip;
    document.querySelectorAll('.filter-btn[data-chip]').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-chip="${chip}"]`)?.classList.add('active');
    renderBoardGrid();
};

function renderBoardGrid() {
    const boardGrid = document.getElementById('boardGrid');
    if (!boardGrid) return;

    let filteredBoards = BOARD_DEFINITIONS;

    if (currentVendorFilter !== 'all') {
        filteredBoards = filteredBoards.filter(b => 
            b.vendor.toLowerCase() === currentVendorFilter.toLowerCase()
        );
    }

    if (currentChipFilter !== 'all') {
        filteredBoards = filteredBoards.filter(b => 
            b.chip === currentChipFilter
        );
    }

    boardGrid.innerHTML = filteredBoards.map(board => `
        <div class="board-card" onclick="selectBoard('${board.id}')">
            <div class="board-icon">${board.icon}</div>
            <div class="board-name">${board.name}</div>
            <div class="board-vendor">${board.vendor}</div>
            <div class="board-chip">${board.chip.toUpperCase()}</div>
        </div>
    `).join('');
}

/**
 * Select a board type and prompt for device configuration
 * @param {string} boardId - Board ID from BOARD_DEFINITIONS
 */
window.selectBoard = async function(boardId) {
    const board = BOARD_DEFINITIONS.find(b => b.id === boardId);
    if (!board) return;

    // Close modal
    closeBoardSelector();

    // Show config form for this device
    const config = await promptDeviceConfig(board);
    if (!config) return; // User cancelled

    // Create disconnected placeholder device
    const device = manager.addDisconnectedDevice(board, config);
    render();
};

/**
 * Prompt user to select connection type (USB or BLE)
 * @returns {Promise<string|null>} Connection type ('usb' or 'ble') or null if cancelled
 */
async function promptConnectionType() {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        
        const closeModal = (result) => {
            modal.remove();
            resolve(result);
        };
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h2>Connection Type</h2>
                    <button class="modal-close" id="connectionCloseBtn">✕</button>
                </div>
                <div class="modal-body">
                    <p style="margin-bottom: 1rem;">How would you like to connect this device?</p>
                    <button class="btn btn-primary" id="connectionUsbBtn" style="width: 100%; margin-bottom: 0.5rem;">🔌 USB (Serial)</button>
                    <button class="btn btn-primary" id="connectionBleBtn" style="width: 100%;">📶 Bluetooth (BLE)</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Attach event listeners
        modal.querySelector('#connectionCloseBtn').addEventListener('click', () => closeModal(null));
        modal.querySelector('#connectionUsbBtn').addEventListener('click', () => closeModal('usb'));
        modal.querySelector('#connectionBleBtn').addEventListener('click', () => closeModal('ble'));
        
        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(null);
            }
        });
    });
}

// Configuration prompt for new device placeholder
async function promptDeviceConfig(board) {
    return new Promise((resolve) => {
        // First, prompt for device name using a modal
        const nameModal = document.createElement('div');
        nameModal.className = 'modal-overlay';
        nameModal.style.display = 'flex';
        let deviceName = null;
        let configResolved = false;
        
        const continueToConfig = () => {
            const input = nameModal.querySelector('#deviceNameInput');
            const name = input?.value.trim();
            if (!name) return;
            
            deviceName = name;
            nameModal.remove();
            showConfigModal();
        };
        
        nameModal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h2>Device Name</h2>
                    <button class="modal-close" id="nameModalCloseBtn">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Enter device name for ${board.name}:</label>
                        <input type="text" id="deviceNameInput" value="NODE-${board.name.toUpperCase()}" style="width: 100%; padding: 0.5rem; margin-top: 0.5rem;">
                    </div>
                    <button class="btn btn-primary" id="nameModalContinueBtn" style="width: 100%; margin-top: 1rem;">Continue</button>
                </div>
            </div>
        `;
        document.body.appendChild(nameModal);
        
        nameModal.querySelector('#nameModalCloseBtn').addEventListener('click', () => {
            nameModal.remove();
            resolve(null);
        });
        
        nameModal.querySelector('#nameModalContinueBtn').addEventListener('click', continueToConfig);
        
        nameModal.addEventListener('click', (e) => {
            if (e.target === nameModal) {
                nameModal.remove();
                resolve(null);
            }
        });
        
        // Focus input and handle Enter key
        setTimeout(() => {
            const input = nameModal.querySelector('#deviceNameInput');
            if (input) {
                input.focus();
                input.select();
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        continueToConfig();
                    }
                });
            }
        }, 100);
        
        const showConfigModal = () => {
            const configModal = document.getElementById('configPanelModal');
            if (!configModal) {
                // Fallback: resolve with minimal config
                resolve({
                    deviceName: deviceName,
                    region: 'US',
                    channelName: 'LongFast',
                    role: 'ROUTER'
                });
                return;
            }
            
            // Update modal title
            const header = configModal.querySelector('.modal-header h2');
            if (header) header.textContent = `Configure ${board.name} - ${deviceName}`;
            
            // Reset form to defaults
            const regionEl = document.getElementById('region');
            if (regionEl) regionEl.value = 'US';
            const channelEl = document.getElementById('channelName');
            if (channelEl) channelEl.value = 'LongFast';
            const roleEl = document.getElementById('nodeRole');
            if (roleEl) roleEl.value = 'ROUTER';
            
            // Switch to basic tab
            switchConfigTab('basic');
            
            // Show modal
            configModal.style.display = 'flex';
            
            // Create a wrapper function to handle the config submission
            const originalApply = window.applyConfigToAll;
            const cleanup = () => {
                window.applyConfigToAll = originalApply;
                configModal.style.display = 'none';
                configModal.removeEventListener('click', overlayClickHandler);
            };
            
            window.applyConfigToAll = async function() {
                if (configResolved) return;
                
                const region = document.getElementById('region')?.value;
                const channelName = document.getElementById('channelName')?.value;
                const nodeRole = document.getElementById('nodeRole')?.value;
                const modemPreset = document.getElementById('modemPreset')?.value;
                const txPower = document.getElementById('txPower')?.value;
                const hopLimit = document.getElementById('hopLimit')?.value;

                if (!region || !channelName) {
                    alert('Please fill in Region and Channel Name');
                    return;
                }

                const config = {
                    deviceName: deviceName,
                    region: region,
                    channelName: channelName,
                    role: nodeRole
                };

                if (modemPreset) config.modemPreset = modemPreset;
                if (txPower) config.txPower = parseInt(txPower, 10);
                if (hopLimit) config.hopLimit = parseInt(hopLimit, 10);

                cleanup();
                configResolved = true;
                resolve(config);
            };
            
            // Handle cancel/close
            const closeBtn = configModal.querySelector('.modal-close');
            const originalClose = closeBtn.onclick;
            closeBtn.onclick = function() {
                cleanup();
                configResolved = true;
                resolve(null);
            };
            
            // Close on overlay click
            const overlayClickHandler = function(e) {
                if (e.target === configModal) {
                    cleanup();
                    configResolved = true;
                    resolve(null);
                }
            };
            configModal.addEventListener('click', overlayClickHandler);
        };
    });
}

// Connect Device Function
window.connectDevice = async function(deviceId) {
    const device = manager.devices.find(d => d.id === deviceId);
    if (!device || device.status !== 'disconnected') return;
    
    const connectionType = await promptConnectionType();
    if (!connectionType) return;
    
    try {
        await manager.connectDevice(deviceId, connectionType);
        render();
    } catch (e) {
        alert(`Failed to connect: ${e.message}`);
    }
};

// Configuration Panel Functions
/**
 * Open configuration panel for a specific device or all devices
 * @param {string|null} [deviceId=null] - Device ID to configure (null = configure all)
 */
window.openConfigPanel = function(deviceId = null) {
    const modal = document.getElementById('configPanelModal');
    if (!modal) return;

    // Store the target device ID (null = all devices)
    modal.dataset.targetDeviceId = deviceId || '';
    
    // Update export button to know about the device
    const exportBtn = document.querySelector('[data-testid="export-config-btn"]');
    if (exportBtn) {
        exportBtn.dataset.deviceId = deviceId || '';
    }

    // Update modal title
    const header = modal.querySelector('.modal-header h2');
    if (header) {
        if (deviceId) {
            const device = manager.devices.find(d => d.id === deviceId);
            header.textContent = device ? `Configure ${device.name}` : 'Configure Device';
        } else {
            header.textContent = 'Configure All Devices';
        }
    }

    // Update apply button text
    const applyBtn = document.getElementById('applyConfigBtn');
    if (applyBtn) {
        const selectedCount = manager.getSelectionCount();
        if (deviceId) {
            applyBtn.textContent = '✅ Apply Configuration';
        } else if (selectedCount > 0) {
            applyBtn.textContent = `✅ Apply to ${selectedCount} Selected`;
        } else {
            applyBtn.textContent = '✅ Apply Configuration to All Devices';
        }
    }

    // Load device's current config if configuring single device
    if (deviceId) {
        const device = manager.devices.find(d => d.id === deviceId);
        if (device) {
            // Load existing config into form (prefer config over pendingConfig)
            const config = device.config || device.pendingConfig || {};
            if (config.region) {
                const regionEl = document.getElementById('region');
                if (regionEl) regionEl.value = config.region;
            }
            if (config.channelName) {
                const channelEl = document.getElementById('channelName');
                if (channelEl) channelEl.value = config.channelName;
            }
            if (config.role) {
                const roleEl = document.getElementById('nodeRole');
                if (roleEl) roleEl.value = config.role;
            }
            if (config.modemPreset) {
                const presetEl = document.getElementById('modemPreset');
                if (presetEl) presetEl.value = config.modemPreset;
            }
            if (config.txPower !== undefined) {
                const txPowerEl = document.getElementById('txPower');
                if (txPowerEl) txPowerEl.value = config.txPower;
            }
            if (config.hopLimit !== undefined) {
                const hopLimitEl = document.getElementById('hopLimit');
                if (hopLimitEl) hopLimitEl.value = config.hopLimit;
            }
        } else {
            // Reset to defaults
            const regionEl = document.getElementById('region');
            if (regionEl) regionEl.value = 'US';
            const channelEl = document.getElementById('channelName');
            if (channelEl) channelEl.value = 'LongFast';
            const roleEl = document.getElementById('nodeRole');
            if (roleEl) roleEl.value = 'ROUTER';
            const presetEl = document.getElementById('modemPreset');
            if (presetEl) presetEl.value = '';
            const txPowerEl = document.getElementById('txPower');
            if (txPowerEl) txPowerEl.value = '';
            const hopLimitEl = document.getElementById('hopLimit');
            if (hopLimitEl) hopLimitEl.value = '';
        }
    } else {
        // Reset form to defaults for "all devices"
        const regionEl = document.getElementById('region');
        if (regionEl) regionEl.value = 'US';
        const channelEl = document.getElementById('channelName');
        if (channelEl) channelEl.value = 'LongFast';
        const roleEl = document.getElementById('nodeRole');
        if (roleEl) roleEl.value = 'ROUTER';
        const presetEl = document.getElementById('modemPreset');
        if (presetEl) presetEl.value = '';
        const txPowerEl = document.getElementById('txPower');
        if (txPowerEl) txPowerEl.value = '';
        const hopLimitEl = document.getElementById('hopLimit');
        if (hopLimitEl) hopLimitEl.value = '';
    }

    // Reset to basic tab
    switchConfigTab('basic');
    // Update preset list
    renderConfigPresets();

    modal.style.display = 'flex';
};

window.closeConfigPanel = function() {
    const modal = document.getElementById('configPanelModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

// Configuration Tab Switching
window.switchConfigTab = function(tabName) {
    // Update tab buttons
    document.querySelectorAll('.config-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        }
    });
    
    // Update tab panels
    document.querySelectorAll('.config-tab-panel').forEach(panel => {
        panel.classList.remove('active');
        if (panel.id === `configTab-${tabName}`) {
            panel.classList.add('active');
        }
    });
    
    // Update advanced settings visibility
    const showAdvanced = document.getElementById('showAdvancedConfig')?.checked || false;
    const modal = document.getElementById('configPanelModal');
    if (showAdvanced) {
        modal?.classList.add('show-advanced');
    } else {
        modal?.classList.remove('show-advanced');
    }
};

// Advanced Settings Toggle
document.addEventListener('DOMContentLoaded', () => {
    const advancedToggle = document.getElementById('showAdvancedConfig');
    if (advancedToggle) {
        advancedToggle.addEventListener('change', (e) => {
            const modal = document.getElementById('configPanelModal');
            if (e.target.checked) {
                modal?.classList.add('show-advanced');
            } else {
                modal?.classList.remove('show-advanced');
            }
        });
    }
});

window.applyConfigToAll = async function() {
    const modal = document.getElementById('configPanelModal');
    if (!modal) return;
    
    // Check if we're configuring a single device, selected devices, or all devices
    const targetDeviceId = modal.dataset.targetDeviceId;
    const selectedCount = manager.getSelectionCount();
    const isSingleDevice = targetDeviceId && targetDeviceId !== '';
    const isSelectedDevices = !isSingleDevice && selectedCount > 0;
    
    const region = document.getElementById('region')?.value;
    const channelName = document.getElementById('channelName')?.value;
    const nodeRole = document.getElementById('nodeRole')?.value;
    const modemPreset = document.getElementById('modemPreset')?.value;
    const txPower = document.getElementById('txPower')?.value;
    const hopLimit = document.getElementById('hopLimit')?.value;

    if (!region || !channelName) {
        alert('Please fill in Region and Channel Name');
        return;
    }

    const config = {
        region: region,
        channelName: channelName,
        role: nodeRole
    };

    if (modemPreset) config.modemPreset = modemPreset;
    if (txPower) config.txPower = parseInt(txPower, 10);
    if (hopLimit) config.hopLimit = parseInt(hopLimit, 10);

    try {
        if (isSingleDevice) {
            // Configure single device
            const device = manager.devices.find(d => d.id === targetDeviceId);
            if (!device) {
                alert('Device not found');
                return;
            }
            
            // Update device's config using applyConfigToDevice
            const shouldInject = device.connectionType !== 'ota' && device.status !== 'disconnected' && device.connection;
            await manager.applyConfigToDevice(targetDeviceId, config, shouldInject);
            
            if (shouldInject) {
                manager.logGlobal(`✅ Configuration applied to ${device.name}`);
            } else {
                manager.logGlobal(`Configuration saved for ${device.name} (will apply on connect)`);
            }
        } else if (isSelectedDevices) {
            // Configure selected devices
            const selectedDevices = manager.getSelectedDevices();
            manager.logGlobal(`Applying configuration to ${selectedDevices.length} selected device(s)...`);
            render();
            
            const results = await Promise.allSettled(
                selectedDevices.map(d => {
                    const shouldInject = d.connectionType !== 'ota' && d.status !== 'disconnected' && d.connection;
                    return manager.applyConfigToDevice(d.id, config, shouldInject);
                })
            );
            
            const successful = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;
            manager.logGlobal(`✅ Configuration applied: ${successful} success, ${failed} failed`);
        } else {
            // Configure all devices
            manager.logGlobal(`Applying configuration to all devices...`);
            render();
            const result = await manager.injectConfigAll(config);
            manager.logGlobal(`✅ Configuration applied: ${result.successful} success, ${result.failed} failed`);
        }
        
        closeConfigPanel();
        render();
    } catch (e) {
        alert(`Config injection error: ${e.message}`);
    }
};

/**
 * Flash all selected devices with firmware
 */
window.flashAllDevices = async function() {
    if (manager.isFlashing) return;

    // Get platform from first device's board type, or default
    const firstDevice = manager.devices.find(d => d.connectionType !== 'ota' && d.boardType);
    const targetPlatform = firstDevice?.boardType || document.getElementById('targetPlatform')?.value || 'tbeam';
    const fullInstall = document.getElementById('fullInstall')?.checked || false;

    const options = {
        eraseAll: fullInstall,
        targetPlatform: targetPlatform
    };

    try {
        manager.logGlobal(`Starting batch flash: ${options.eraseAll ? 'Full Install' : 'Update'} for ${targetPlatform}`);
        render();
        await manager.flashAllUSB(options);
    } catch (e) {
        alert(`Flash error: ${e.message}`);
    }
    render();
};

// Close modals when clicking outside
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.style.display = 'none';
    }
});

// Load esptool-js from CDN
async function loadEsptool() {
    try {
        // Dynamic import from CDN
        const module = await import('https://unpkg.com/esptool-js@0.4.5/bundle.js');
        window.esptoolPackage = module;
        console.log('esptool-js loaded successfully');
    } catch (e) {
        console.warn('Failed to load esptool-js from CDN:', e);
    }
}
loadEsptool();

// UI DOM References
const firmwareType = document.getElementById('firmwareType');
const customFile = document.getElementById('customFile');
const releaseChannel = document.getElementById('releaseChannel');
const targetPlatform = document.getElementById('targetPlatform');
const fullInstallCheckbox = document.getElementById('fullInstall');

// Track currently available releases
let allReleases = { stable: [], alpha: [] };

// Load dynamic releases from Meshtastic API
async function loadReleases() {
    try {
        allReleases = await manager.fetchReleases();
        updateReleaseOptions();
    } catch (e) {
        console.error('Failed to load releases:', e);
    }
}

function updateReleaseOptions() {
    if (!firmwareType) return;
    
    const channel = releaseChannel?.value || 'stable';
    const releases = channel === 'stable' ? allReleases.stable : allReleases.alpha;
    
    firmwareType.innerHTML = releases.map(r => `
        <option value="${r.id}">${r.title || r.id}</option>
    `).join('') + '<option value="custom">Custom .bin Files</option>';
    
    // Select first release by default
    if (releases.length > 0 && firmwareType.value !== 'custom') {
        manager.selectRelease(releases[0]);
    }
}

// Initialize
loadReleases();

// Handle release channel change (stable/alpha)
releaseChannel?.addEventListener('change', () => {
    updateReleaseOptions();
});

// Handle firmware version selection
firmwareType?.addEventListener('change', (e) => {
    if (e.target.value === 'custom') {
        customFile.style.display = 'block';
        manager.selectedRelease = null;
    } else {
        customFile.style.display = 'none';
        const channel = releaseChannel?.value || 'stable';
        const releases = channel === 'stable' ? allReleases.stable : allReleases.alpha;
        const selected = releases.find(r => r.id === e.target.value);
        if (selected) manager.selectRelease(selected);
    }
    render();
});

// Handle custom firmware file uploads
customFile?.addEventListener('change', async (e) => {
    await manager.loadFirmwareFiles(e.target.files);
    render();
});

// Add Export Button Handler
const controlsCard = document.querySelector('.controls .card:first-child');
if (controlsCard) {
    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-secondary';
    exportBtn.style.marginTop = '0.5rem';
    exportBtn.innerText = '📊 Export Report';
    exportBtn.onclick = () => manager.exportReport();
    controlsCard.appendChild(exportBtn);
}

// Button references
const flashAllBtn = document.getElementById('flashAllBtn');
const otaBtn = document.getElementById('otaBtn');

// Flash All USB Handler (REAL FLASHING)
if (flashAllBtn) {
    flashAllBtn.onclick = async () => {
        if (manager.isFlashing) return;
        
        const options = {
            eraseAll: fullInstallCheckbox?.checked || false,
            targetPlatform: targetPlatform?.value || 'tbeam'
        };
        
        try {
            manager.logGlobal(`Starting flash: ${options.eraseAll ? 'Full Install' : 'Update'} for ${options.targetPlatform}`);
            render();
            await manager.flashAllUSB(options);
        } catch (e) {
            alert(`Flash error: ${e.message}`);
        }
        render();
    };
}

// OTA Handler
if (otaBtn) {
    otaBtn.onclick = async () => {
        if (manager.isFlashing) return;
        
        try {
            await manager.flashAllOTA();
        } catch (e) {
            alert(`OTA error: ${e.message}`);
        }
    };
}

// Set first USB/BLE device as OTA gateway automatically
const originalAddDeviceUSB = manager.addDeviceUSB.bind(manager);
manager.addDeviceUSB = async function(...args) {
    const device = await originalAddDeviceUSB(...args);
    if (!manager.otaGateway && device.connectionType !== 'ota') {
        manager.setOTAGateway(device.id);
    }
    render();
    return device;
};

const originalAddDeviceBLE = manager.addDeviceBLE.bind(manager);
manager.addDeviceBLE = async function(...args) {
    const device = await originalAddDeviceBLE(...args);
    if (!manager.otaGateway && device.connectionType !== 'ota') {
        manager.setOTAGateway(device.id);
    }
    render();
    return device;
};

const originalAddDeviceOTA = manager.addDeviceOTA.bind(manager);
manager.addDeviceOTA = async function(...args) {
    const device = await originalAddDeviceOTA(...args);
    render();
    return device;
};

function renderDashboard() {
    const dashboard = document.getElementById('fleetDashboard');
    if (!dashboard) return;

    const devices = manager.devices;
    const totalDevices = devices.length;
    
    if (totalDevices === 0) {
        dashboard.innerHTML = '';
        return;
    }

    // Calculate Fleet Health (% ready)
    const readyDevices = devices.filter(d => d.status === 'ready').length;
    const healthPercent = totalDevices > 0 ? Math.round((readyDevices / totalDevices) * 100) : 0;
    const healthClass = healthPercent >= 80 ? 'success' : healthPercent >= 50 ? 'warning' : 'error';

    // Calculate Battery Watch
    const devicesWithBattery = devices.filter(d => d.telemetry && d.telemetry.batt && d.telemetry.batt !== '--');
    const batteryValues = devicesWithBattery.map(d => parseFloat(d.telemetry.batt));
    const avgBattery = batteryValues.length > 0 
        ? (batteryValues.reduce((a, b) => a + b, 0) / batteryValues.length).toFixed(2)
        : '--';
    const lowBatteryCount = batteryValues.filter(b => b < 3.5).length;
    const batteryClass = lowBatteryCount === 0 ? 'success' : lowBatteryCount <= 2 ? 'warning' : 'error';

    // Calculate Signal Strength (Average SNR)
    const devicesWithSNR = devices.filter(d => d.telemetry && d.telemetry.snr && d.telemetry.snr !== '--');
    const snrValues = devicesWithSNR.map(d => parseFloat(d.telemetry.snr));
    const avgSNR = snrValues.length > 0
        ? (snrValues.reduce((a, b) => a + b, 0) / snrValues.length).toFixed(1)
        : '--';
    const snrClass = avgSNR !== '--' && parseFloat(avgSNR) > 0 ? 'success' : 'warning';

    // Get recent global events (last 3)
    const recentEvents = manager.globalLogs.slice(0, 3);

    dashboard.innerHTML = `
        <div class="dash-card ${healthClass}" data-filter-action="ready" title="Click to filter ready devices">
            <div class="dash-label">Fleet Health</div>
            <div class="dash-value">
                ${healthPercent}<span class="dash-unit">%</span>
            </div>
            <div class="dash-subtext">
                <span class="status-indicator ${healthClass === 'success' ? 'pulse-animation' : ''}" style="background: ${healthClass === 'success' ? 'var(--success)' : healthClass === 'warning' ? '#f59e0b' : 'var(--error)'};"></span>
                ${readyDevices} of ${totalDevices} ready
            </div>
        </div>

        <div class="dash-card ${batteryClass}" data-filter-action="low-battery" title="Click to filter low battery devices">
            <div class="dash-label">Battery Watch</div>
            <div class="dash-value">
                ${avgBattery}<span class="dash-unit">V</span>
            </div>
            <div class="dash-subtext">
                <span class="status-indicator ${batteryClass === 'error' ? 'pulse-animation' : ''}" style="background: ${batteryClass === 'success' ? 'var(--success)' : batteryClass === 'warning' ? '#f59e0b' : 'var(--error)'};"></span>
                ${lowBatteryCount > 0 ? `${lowBatteryCount} low` : 'All good'}
            </div>
        </div>

        <div class="dash-card ${snrClass}" title="Average signal strength">
            <div class="dash-label">Signal Strength</div>
            <div class="dash-value">
                ${avgSNR}<span class="dash-unit">dB</span>
            </div>
            <div class="dash-subtext">
                <span class="status-indicator" style="background: ${snrClass === 'success' ? 'var(--success)' : '#f59e0b'};"></span>
                Average SNR
            </div>
        </div>

        <div class="dash-card" style="grid-column: span 1;">
            <div class="dash-label">Recent Activity</div>
            <div class="event-ticker">
                ${recentEvents.length > 0 
                    ? recentEvents.map(log => {
                        const parts = log.match(/^\[([^\]]+)\]\s*(.+)$/);
                        const timestamp = parts ? parts[1] : '';
                        const message = parts ? parts[2] : log;
                        return `
                            <div class="ticker-item">
                                <span class="ticker-timestamp">${timestamp}</span>
                                <span class="ticker-msg">${message}</span>
                            </div>
                        `;
                    }).join('')
                    : '<div class="ticker-item"><span class="ticker-msg">No recent activity</span></div>'
                }
            </div>
        </div>
    `;

    // Add click handlers for interactive filtering
    dashboard.querySelectorAll('[data-filter-action]').forEach(card => {
        card.addEventListener('click', () => {
            const action = card.dataset.filterAction;
            if (action === 'ready') {
                const statusFilter = document.getElementById('statusFilter');
                if (statusFilter) {
                    statusFilter.value = 'ready';
                    filterDevices();
                }
            } else if (action === 'low-battery') {
                // Filter devices with low battery (< 3.5V)
                const searchInput = document.getElementById('deviceSearch');
                if (searchInput) {
                    searchInput.value = 'low-battery';
                    filterDevices();
                }
            }
        });
    });
}

function render() {
    // Render dashboard first
    renderDashboard();

    const deviceGrid = document.getElementById('deviceGrid');
    const emptyState = document.getElementById('emptyState');
    const deviceCountBadge = document.getElementById('deviceCountBadge');
    const applyProfileBtn = document.getElementById('applyProfileBtn');
    const flashAllBtn = document.getElementById('flashAllBtn');
    
    if (!deviceGrid) return;

    // Show/hide empty state
    if (manager.devices.length === 0) {
        deviceGrid.innerHTML = '<div class="empty-state" id="emptyState"><div class="empty-icon">📡</div><h2>No devices added yet</h2><p>Click "Add Device" to start batch programming</p></div>';
    } else {
        deviceGrid.innerHTML = manager.devices.map(d => {
            const isSelected = manager.isSelected(d.id);
            const canSelect = d.connectionType !== 'ota';
            const isReady = d.status === 'ready' && canSelect;
            const boardInfo = d.boardName ? `${d.boardName} (${d.boardVendor})` : 'Unknown Board';
            const boardIcon = d.boardIcon || '📡';
            
            return `
            <div class="device-card ${d.status === 'active' ? 'flashing' : ''} ${isSelected ? 'device-selected' : ''} ${isReady ? 'device-ready' : ''}" 
                 data-device-id="${d.id}"
                 style="${manager.otaGateway?.id === d.id ? 'border: 2px solid var(--accent);' : ''}">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                            ${canSelect ? `
                            <label style="display: flex; align-items: center; cursor: pointer;">
                                <input type="checkbox" 
                                       ${isSelected ? 'checked' : ''} 
                                       onchange="manager.selectDevice('${d.id}', this.checked); render();"
                                       style="cursor: pointer; width: 20px; height: 20px;"
                                       ${manager.isFlashing ? 'disabled' : ''}>
                            </label>
                            ` : ''}
                            <span class="device-name" style="font-weight: 700; font-size: 1.1rem; cursor: pointer;" onclick="renameDevice('${d.id}')" title="Click to rename">
                                ${d.name}
                            </span>
                        </div>
                        <div style="font-size: 0.85rem; color: var(--text-dim); margin-bottom: 0.5rem;">
                            ${boardIcon} ${boardInfo}
                        </div>
                        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.5rem;">
                            <span style="font-size:0.75rem; padding: 0.25rem 0.5rem; background: var(--bg-secondary); border-radius: 0.25rem; text-transform: uppercase;">${d.connectionType}</span>
                            ${manager.otaGateway?.id === d.id ? '<span style="font-size:0.75rem; padding: 0.25rem 0.5rem; background: rgba(56,189,248,0.2); border-radius: 0.25rem; color: var(--accent);">🌐 GATEWAY</span>' : ''}
                            ${d.chipInfo ? `<span style="font-size:0.75rem; padding: 0.25rem 0.5rem; background: rgba(34,197,94,0.2); border-radius: 0.25rem; color: var(--success);">${d.chipInfo}</span>` : ''}
                            ${d.configured ? '<span style="font-size:0.75rem; padding: 0.25rem 0.5rem; background: rgba(34,197,94,0.2); border-radius: 0.25rem; color: var(--success);">⚙️ Configured</span>' : ''}
                            ${isReady ? '<span style="font-size:0.75rem; padding: 0.25rem 0.5rem; background: rgba(34,197,94,0.2); border-radius: 0.25rem; color: var(--success);">✓ Ready</span>' : ''}
                            <span class="status-pill status-${d.status}">${d.status}</span>
                        </div>
                        ${((d.config && Object.keys(d.config).length > 0) || (d.pendingConfig && Object.keys(d.pendingConfig).length > 0)) ? `
                        <div style="margin-bottom: 0.75rem; padding: 0.5rem; background: var(--bg-secondary); border-radius: 0.25rem; font-size: 0.75rem;">
                            <div style="font-weight: 600; margin-bottom: 0.25rem; color: var(--text-dim);">Config:</div>
                            <div style="display: flex; flex-direction: column; gap: 0.2rem;">
                                ${(d.config?.region || d.pendingConfig?.region) ? `<div>📍 ${d.config?.region || d.pendingConfig?.region}</div>` : ''}
                                ${(d.config?.channelName || d.pendingConfig?.channelName) ? `<div>📡 ${d.config?.channelName || d.pendingConfig?.channelName}</div>` : ''}
                                ${(d.config?.role || d.pendingConfig?.role) ? `<div>👤 ${d.config?.role || d.pendingConfig?.role}</div>` : ''}
                            </div>
                        </div>
                        ` : ''}
                        ${d.tags && d.tags.length > 0 ? `
                        <div style="display: flex; gap: 0.25rem; flex-wrap: wrap; margin-bottom: 0.5rem;">
                            ${d.tags.map(tag => `<span style="font-size:0.7rem; padding: 0.2rem 0.4rem; background: rgba(139,92,246,0.2); border-radius: 0.25rem; color: #a78bfa;">#${tag}</span>`).join('')}
                        </div>
                        ` : ''}
                        ${d.connectionType !== 'ota' && d.status !== 'disconnected' ? `
                        <div style="margin-top: 0.5rem;">
                            <button onclick="openConfigPanel('${d.id}')" 
                                    class="btn btn-secondary" 
                                    data-testid="configure-device-btn"
                                    style="font-size: 0.85rem; padding: 0.4rem 0.8rem; width: 100%;"
                                    ${manager.isFlashing ? 'disabled' : ''}>
                                ⚙️ Configure
                            </button>
                        </div>
                        ` : ''}
                    </div>
                    <button onclick="manager.removeDevice('${d.id}'); render();" 
                            style="background:none; border:none; color:var(--error); cursor:pointer; padding: 0.5rem; font-size: 1.5rem; line-height: 1; opacity: 0.7; transition: opacity 0.2s;" 
                            onmouseover="this.style.opacity='1'" 
                            onmouseout="this.style.opacity='0.7'"
                            ${manager.isFlashing ? 'disabled' : ''} 
                            title="Remove device">✕</button>
                </div>
                ${d.progress > 0 ? `
                <div class="progress-container">
                    <div class="progress-bar" style="width: ${d.progress}%"></div>
                </div>
                <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 0.25rem;">${d.progress}%</div>
                ` : ''}
                ${d.logs && d.logs.length > 0 ? `
                <div class="log-container" style="margin-top: 1rem; height: 60px; font-size: 0.7rem;">
                    ${d.logs.slice(0, 3).map(l => `<div>${l}</div>`).join('')}
                </div>
                ` : ''}
            </div>
        `;
        }).join('');
    }

    // Update device count badge
    const deviceCount = manager.devices.length;
    if (deviceCountBadge) {
        deviceCountBadge.textContent = `${deviceCount} device${deviceCount !== 1 ? 's' : ''}`;
    }

    // Update buttons
    const hasDirectDevices = manager.devices.some(d => d.connectionType !== 'ota' && d.status !== 'disconnected');
    const hasDisconnectedDevices = manager.devices.some(d => d.status === 'disconnected');
    const hasFirmware = manager.firmwareBinaries.length > 0 || manager.selectedRelease !== null;
    
    if (applyProfileBtn) {
        applyProfileBtn.disabled = manager.devices.length === 0 || manager.isFlashing;
        const selectedCount = manager.getSelectionCount();
        if (selectedCount > 0) {
            applyProfileBtn.textContent = `⚙️ Configure ${selectedCount} Selected`;
        } else {
            applyProfileBtn.textContent = '⚙️ Configure All';
        }
    }
    if (flashAllBtn) {
        flashAllBtn.disabled = !hasDirectDevices || manager.isFlashing || !hasFirmware;
    }
    
    // Update device count badge to show disconnected devices
    if (deviceCountBadge && hasDisconnectedDevices) {
        const connectedCount = manager.devices.filter(d => d.status !== 'disconnected').length;
        const disconnectedCount = manager.devices.filter(d => d.status === 'disconnected').length;
        deviceCountBadge.textContent = `${connectedCount} connected, ${disconnectedCount} pending`;
    }

    // Apply filters
    filterDevices();
}

function updateBatchStatus() {
    const batchStatus = document.getElementById('batchStatus');
    const batchStatusText = document.getElementById('batchStatusText');
    const batchIndicator = batchStatus?.querySelector('.batch-status-indicator');
    
    if (!batchStatus || !batchStatusText || !batchIndicator) return;
    
    const directDevices = manager.devices.filter(d => d.connectionType !== 'ota');
    const readyDevices = directDevices.filter(d => d.status === 'ready');
    const flashingDevices = directDevices.filter(d => d.status === 'active');
    const errorDevices = directDevices.filter(d => d.status === 'error');
    const doneDevices = directDevices.filter(d => d.status === 'done');
    
    if (manager.isFlashing || flashingDevices.length > 0) {
        batchIndicator.className = 'batch-status-indicator flashing';
        batchStatusText.textContent = `⚡ Flashing ${flashingDevices.length} device(s)...`;
    } else if (errorDevices.length > 0) {
        batchIndicator.className = 'batch-status-indicator error';
        batchStatusText.textContent = `❌ ${errorDevices.length} device(s) failed`;
    } else if (directDevices.length === 0) {
        batchIndicator.className = 'batch-status-indicator';
        batchStatusText.textContent = 'No devices connected';
    } else if (readyDevices.length === directDevices.length) {
        batchIndicator.className = 'batch-status-indicator ready';
        batchStatusText.textContent = `✅ ${readyDevices.length} device(s) ready for batch operations`;
    } else if (doneDevices.length > 0) {
        batchIndicator.className = 'batch-status-indicator ready';
        batchStatusText.textContent = `✅ ${doneDevices.length} completed, ${readyDevices.length} ready`;
    } else {
        batchIndicator.className = 'batch-status-indicator';
        batchStatusText.textContent = `${directDevices.length} device(s) connected`;
    }
}

// Template Management
window.saveCurrentAsTemplate = function() {
    const templateName = document.getElementById('templateName')?.value;
    const templateDeviceName = document.getElementById('templateDeviceName')?.value;
    const region = document.getElementById('region')?.value;
    const channelName = document.getElementById('channelName')?.value;
    const nodeRole = document.getElementById('nodeRole')?.value;
    const modemPreset = document.getElementById('modemPreset')?.value;
    const txPower = document.getElementById('txPower')?.value;
    const hopLimit = document.getElementById('hopLimit')?.value;
    
    if (!templateName) {
        alert('Please enter a template name');
        return;
    }
    
    try {
        const template = manager.createTemplate({
            name: templateName,
            deviceName: templateDeviceName || templateName,
            region: region,
            channelName: channelName,
            role: nodeRole,
            modemPreset: modemPreset || undefined,
            txPower: txPower ? parseInt(txPower, 10) : undefined,
            hopLimit: hopLimit ? parseInt(hopLimit, 10) : undefined
        });
        
        // Clear form
        document.getElementById('templateName').value = '';
        document.getElementById('templateDeviceName').value = '';
        
        renderTemplates();
        render();
    } catch (e) {
        alert(`Failed to create template: ${e.message}`);
    }
};

window.addPendingDevice = async function(templateId) {
    const template = manager.getTemplate(templateId);
    if (!template) return;
    
    const inputId = 'templateDeviceNameInput_' + Date.now();
    const name = await showPrompt(
        `Enter device name (or leave blank for "${template.deviceName}"):`,
        template.deviceName
    );
    
    if (name !== null) {
        manager.addPendingDevice(templateId, name || template.deviceName);
        renderTemplates();
        render();
    }
};

window.deleteTemplate = async function(templateId) {
    const confirmed = await showConfirm('Delete this template?');
    if (!confirmed) return;
    manager.deleteTemplate(templateId);
    renderTemplates();
    render();
};

window.removePendingDevice = function(pendingId) {
    manager.removePendingDevice(pendingId);
    renderTemplates();
    render();
};

window.renameDevice = async function(deviceId) {
    const device = manager.devices.find(d => d.id === deviceId);
    if (!device) return;
    
    const newName = await showPrompt('Device name:', device.name);
    if (newName) {
        manager.renameDevice(deviceId, newName);
        render();
    }
};

function renderTemplates() {
    const templateList = document.getElementById('templateList');
    const pendingDevices = document.getElementById('pendingDevices');
    
    if (!templateList || !pendingDevices) return;
    
    if (manager.deviceTemplates.length === 0) {
        templateList.innerHTML = '<div style="color: var(--text-dim); font-size: 0.85rem; text-align: center; padding: 1rem;">No templates saved. Create one above!</div>';
    } else {
        templateList.innerHTML = manager.deviceTemplates.map(t => `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.5rem; background: #0f172a; border-radius: 0.375rem; margin-bottom: 0.5rem;">
                <div style="flex: 1;">
                    <div style="font-weight: 600; font-size: 0.9rem;">${t.name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-dim);">
                        ${t.deviceName} | ${t.region} | ${t.role} | ${t.channelName}
                    </div>
                </div>
                <div style="display: flex; gap: 0.25rem;">
                    <button onclick="addPendingDevice('${t.id}')" style="background: var(--accent); color: #000; border: none; padding: 0.25rem 0.5rem; border-radius: 0.25rem; cursor: pointer; font-size: 0.75rem;">+ Add</button>
                    <button onclick="deleteTemplate('${t.id}')" style="background: var(--error); color: #fff; border: none; padding: 0.25rem 0.5rem; border-radius: 0.25rem; cursor: pointer; font-size: 0.75rem;">✕</button>
                </div>
            </div>
        `).join('');
    }
    
    if (manager.pendingDevices.length === 0) {
        pendingDevices.innerHTML = '<div style="color: var(--text-dim); font-size: 0.85rem; text-align: center; padding: 0.5rem;">No pending devices. Add devices from templates above.</div>';
    } else {
        pendingDevices.innerHTML = manager.pendingDevices.map(p => `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.5rem; background: #0f172a; border-radius: 0.375rem; margin-bottom: 0.5rem;">
                <div>
                    <div style="font-weight: 600; font-size: 0.85rem;">${p.name}</div>
                    <div style="font-size: 0.7rem; color: var(--text-dim);">Template: ${p.template.name}</div>
                </div>
                <button onclick="removePendingDevice('${p.id}')" style="background: var(--error); color: #fff; border: none; padding: 0.25rem 0.5rem; border-radius: 0.25rem; cursor: pointer; font-size: 0.75rem;">✕</button>
            </div>
        `).join('');
    }
}

// Mission Profile Application
window.applyMissionProfile = async function() {
    const region = document.getElementById('region')?.value;
    const channelName = document.getElementById('channelName')?.value;
    const nodeRole = document.getElementById('nodeRole')?.value;
    const modemPreset = document.getElementById('modemPreset')?.value;
    const txPower = document.getElementById('txPower')?.value;
    const hopLimit = document.getElementById('hopLimit')?.value;
    
    if (!region || !channelName) {
        alert('Please fill in Region and Channel Name');
        return;
    }
    
    const profile = {
        name: 'Batch Profile',
        region: region,
        channelName: channelName,
        role: nodeRole
    };
    
    // Add optional fields if provided
    if (modemPreset) profile.modemPreset = modemPreset;
    if (txPower) profile.txPower = parseInt(txPower, 10);
    if (hopLimit) profile.hopLimit = parseInt(hopLimit, 10);
    
    try {
        const selectedCount = manager.getSelectionCount();
        
        if (selectedCount > 0) {
            // Apply to selected devices only
            manager.logGlobal(`Applying mission profile to ${selectedCount} selected device(s)...`);
            render();
            const result = await manager.injectConfigSelected(profile);
            manager.logGlobal(`✅ Profile applied to selected: ${result.successful} success, ${result.failed} failed`);
        } else {
            // Apply to all devices (fallback behavior)
            manager.logGlobal(`Applying mission profile to all devices...`);
            render();
            const result = await manager.injectConfigAll(profile);
            manager.logGlobal(`✅ Profile applied: ${result.successful} success, ${result.failed} failed`);
        }
        render();
    } catch (e) {
        alert(`Config injection error: ${e.message}`);
    }
};

// Start telemetry updates (simulated for now)
// In production, this would be replaced with real Meshtastic packet parsing
let telemetryInterval = null;
function startTelemetry() {
    if (!telemetryInterval) {
        telemetryInterval = startTelemetryUpdates(manager, 2000); // Update every 2 seconds
    }
}
function stopTelemetry() {
    if (telemetryInterval) {
        clearInterval(telemetryInterval);
        telemetryInterval = null;
    }
}

// Wrap render to auto-start/stop telemetry and update packet rain
const originalRender = render;
render = function() {
    originalRender();
    
    // Update packet rain
    if (packetRain) {
        packetRain.update(manager.devices);
    }
    
    // Auto-start/stop telemetry
    if (manager.devices.length > 0 && !telemetryInterval) {
        startTelemetry();
    } else if (manager.devices.length === 0 && telemetryInterval) {
        stopTelemetry();
    }
};
window.render = render; // Update global reference

/**
 * Render config presets dropdown
 */
window.renderConfigPresets = function() {
    const presetSelect = document.getElementById('configPresetSelect');
    if (!presetSelect) return;
    
    const presets = manager.getConfigurationPresets();
    const currentValue = presetSelect.value;
    
    presetSelect.innerHTML = '<option value="">Load Preset...</option>';
    presets.forEach(preset => {
        const option = document.createElement('option');
        option.value = preset.id;
        option.textContent = preset.name;
        presetSelect.appendChild(option);
    });
    
    // Restore selection if still valid
    if (currentValue && presets.find(p => p.id === currentValue)) {
        presetSelect.value = currentValue;
    }
};

/**
 * Load a config preset into the form
 */
window.loadConfigPreset = function(presetId) {
    if (!presetId) return;
    
    try {
        const config = manager.loadConfigurationPreset(presetId);
        
        // Load config into form fields
        if (config.region) {
            const regionEl = document.getElementById('region');
            if (regionEl) regionEl.value = config.region;
        }
        if (config.channelName) {
            const channelEl = document.getElementById('channelName');
            if (channelEl) channelEl.value = config.channelName;
        }
        if (config.role) {
            const roleEl = document.getElementById('nodeRole');
            if (roleEl) roleEl.value = config.role;
        }
        if (config.modemPreset) {
            const presetEl = document.getElementById('modemPreset');
            if (presetEl) presetEl.value = config.modemPreset;
        }
        if (config.txPower !== undefined) {
            const txPowerEl = document.getElementById('txPower');
            if (txPowerEl) txPowerEl.value = config.txPower;
        }
        if (config.hopLimit !== undefined) {
            const hopLimitEl = document.getElementById('hopLimit');
            if (hopLimitEl) hopLimitEl.value = config.hopLimit;
        }
    } catch (e) {
        alert(`Failed to load preset: ${e.message}`);
    }
};

/**
 * Save current config form as a preset
 */
window.saveCurrentConfigAsPreset = async function() {
    const name = await showPrompt('Enter preset name:', 'My Preset');
    if (!name) return;
    
    // Read current form values
    const region = document.getElementById('region')?.value;
    const channelName = document.getElementById('channelName')?.value;
    const nodeRole = document.getElementById('nodeRole')?.value;
    const modemPreset = document.getElementById('modemPreset')?.value;
    const txPower = document.getElementById('txPower')?.value;
    const hopLimit = document.getElementById('hopLimit')?.value;
    
    const config = {};
    if (region && region !== '') config.region = region;
    if (channelName && channelName !== '') config.channelName = channelName;
    if (nodeRole && nodeRole !== '') config.role = nodeRole;
    if (modemPreset && modemPreset !== '') config.modemPreset = modemPreset;
    if (txPower && txPower !== '') config.txPower = parseInt(txPower, 10);
    if (hopLimit && hopLimit !== '') config.hopLimit = parseInt(hopLimit, 10);
    
    try {
        manager.saveConfigurationPreset(name, config);
        if (!window.IS_TEST) {
            await showAlert(`Preset "${name}" saved successfully`);
        }
        renderConfigPresets();
    } catch (e) {
        alert(`Failed to save preset: ${e.message}`);
    }
};

/**
 * Export current config to JSON file
 */
window.exportCurrentConfig = function() {
    const modal = document.getElementById('configPanelModal');
    if (!modal) return;
    
    // Check both modal and button for the device ID
    const exportBtn = document.querySelector('[data-testid="export-config-btn"]');
    let targetDeviceId = modal.dataset.targetDeviceId || exportBtn?.dataset.deviceId || '';
    if (targetDeviceId === 'null' || targetDeviceId === 'undefined') targetDeviceId = '';
    
    // Read current form values
    const region = document.getElementById('region')?.value;
    const channelName = document.getElementById('channelName')?.value;
    const nodeRole = document.getElementById('nodeRole')?.value;
    const modemPreset = document.getElementById('modemPreset')?.value;
    const txPower = document.getElementById('txPower')?.value;
    const hopLimit = document.getElementById('hopLimit')?.value;
    
    const config = {};
    if (region && region !== '') config.region = region;
    if (channelName && channelName !== '') config.channelName = channelName;
    if (nodeRole && nodeRole !== '') config.role = nodeRole;
    if (modemPreset && modemPreset !== '') config.modemPreset = modemPreset;
    if (txPower && txPower !== '') config.txPower = parseInt(txPower, 10);
    if (hopLimit && hopLimit !== '') config.hopLimit = parseInt(hopLimit, 10);
    
    try {
        const exportData = {
            config: config,
            exportedAt: new Date().toISOString()
        };
        
        if (targetDeviceId && targetDeviceId !== '') {
            exportData.deviceId = targetDeviceId;
            const device = manager.devices.find(d => d.id === targetDeviceId);
            if (device) {
                exportData.deviceName = device.name;
            }
        }
        
        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = (targetDeviceId && targetDeviceId !== '') ? `device-config-${targetDeviceId}.json` : `batch-config-${Date.now()}.json`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
        alert(`Export failed: ${e.message}`);
    }
};

/**
 * Import config from JSON file
 */
window.importConfig = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const data = manager.importConfiguration(text);
            
            // Load imported config into form
            const config = data.config || data;
            if (config.region) {
                const regionEl = document.getElementById('region');
                if (regionEl) regionEl.value = config.region;
            }
            if (config.channelName) {
                const channelEl = document.getElementById('channelName');
                if (channelEl) channelEl.value = config.channelName;
            }
            if (config.role) {
                const roleEl = document.getElementById('nodeRole');
                if (roleEl) roleEl.value = config.role;
            }
            if (config.modemPreset) {
                const presetEl = document.getElementById('modemPreset');
                if (presetEl) presetEl.value = config.modemPreset;
            }
            if (config.txPower !== undefined) {
                const txPowerEl = document.getElementById('txPower');
                if (txPowerEl) txPowerEl.value = config.txPower;
            }
            if (config.hopLimit !== undefined) {
                const hopLimitEl = document.getElementById('hopLimit');
                if (hopLimitEl) hopLimitEl.value = config.hopLimit;
            }
            
            await showAlert('Config imported successfully');
        } catch (e) {
            alert(`Import failed: ${e.message}`);
        }
    };
    input.click();
};

window.filterDevices = function() {
    const searchTermInput = document.getElementById('deviceSearch');
    const searchTerm = searchTermInput?.value.toLowerCase() || '';
    const groupFilter = document.getElementById('groupFilter')?.value || 'all';
    const statusFilter = document.getElementById('statusFilter')?.value || 'all';
    
    const deviceCards = document.querySelectorAll('.device-card');
    
    deviceCards.forEach(card => {
        const deviceId = card.dataset.deviceId;
        const device = manager.devices.find(d => d.id === deviceId);
        if (!device) return;
        
        let visible = true;
        
        // Search term filter
        if (searchTerm) {
            // Special filter for low battery
            if (searchTerm === 'low-battery') {
                const batt = device.telemetry?.batt;
                if (!batt || batt === '--' || parseFloat(batt) >= 3.5) {
                    visible = false;
                }
            } else {
                const cleanSearch = searchTerm.startsWith('#') ? searchTerm.substring(1) : searchTerm;
                const nameMatch = device.name.toLowerCase().includes(cleanSearch);
                const tagMatch = device.tags?.some(t => t.toLowerCase().includes(cleanSearch));
                const idMatch = device.id.toLowerCase().includes(cleanSearch);
                
                if (!nameMatch && !tagMatch && !idMatch) {
                    visible = false;
                }
            }
        }
        
        // Group filter
        if (visible && groupFilter !== 'all') {
            if (device.groupId !== groupFilter) {
                visible = false;
            }
        }
        
        // Status filter
        if (visible && statusFilter !== 'all') {
            if (device.status !== statusFilter) {
                visible = false;
            }
        }
        
        card.style.display = visible ? 'flex' : 'none'; // Use flex to match .device-card style
    });
};

// Initialize board grid and filters on load
document.addEventListener('DOMContentLoaded', () => {
    renderBoardGrid();
    render();
    
    // Set up filter listeners
    document.getElementById('deviceSearch')?.addEventListener('input', filterDevices);
    document.getElementById('groupFilter')?.addEventListener('change', filterDevices);
    document.getElementById('statusFilter')?.addEventListener('change', filterDevices);
});
