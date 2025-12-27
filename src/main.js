import { BatchManager } from './BatchManager.js';
import { renderSNRChart, renderAirUtilChart } from './ChartRenderer.js';
import { startTelemetryUpdates } from './TelemetrySimulator.js';
import { PacketRain } from './PacketRain.js';

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

// Platform selector
window.selectPlatform = function(platform) {
    document.getElementById('targetPlatform').value = platform;
    // Update visual selection
    document.querySelectorAll('.platform-card').forEach(card => {
        card.classList.remove('selected');
    });
    document.querySelector(`[data-platform="${platform}"]`)?.classList.add('selected');
    render();
};

// Initialize platform selection
document.addEventListener('DOMContentLoaded', () => {
    selectPlatform('tbeam'); // Default to T-Beam
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

function updateButtons() {
    const hasDirectDevices = manager.devices.some(d => d.connectionType !== 'ota');
    const hasOTATargets = manager.devices.some(d => d.connectionType === 'ota');
    const hasGateway = manager.otaGateway !== null;
    const hasFirmware = manager.firmwareBinaries.length > 0 || manager.selectedRelease !== null;
    const selectedCount = manager.getSelectionCount();
    const applyProfileBtn = document.getElementById('applyProfileBtn');
    
    if (flashAllBtn) {
        flashAllBtn.disabled = !hasDirectDevices || manager.isFlashing || !hasFirmware;
    }
    if (otaBtn) {
        otaBtn.disabled = !hasOTATargets || !hasGateway || manager.isFlashing || !hasFirmware;
    }
    if (applyProfileBtn) {
        // Update button text based on selection
        if (selectedCount > 0) {
            applyProfileBtn.textContent = `⚙️ Apply to ${selectedCount} Selected`;
        } else {
            applyProfileBtn.textContent = '⚙️ Apply to All Devices';
        }
    }
}

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

function render() {
    const deviceGrid = document.getElementById('deviceGrid');
    const globalLog = document.getElementById('globalLog');
    const batchStats = document.getElementById('batchStats');
    
    if (!deviceGrid || !globalLog || !batchStats) return;
    
    deviceGrid.innerHTML = manager.devices.map(d => {
        const isSelected = manager.isSelected(d.id);
        const canSelect = d.connectionType !== 'ota'; // Don't allow selecting OTA targets
        const isReady = d.status === 'ready' && canSelect;
        return `
        <div class="device-card ${d.status === 'active' ? 'flashing' : ''} ${isSelected ? 'device-selected' : ''} ${isReady ? 'device-ready' : ''}" 
             style="${manager.otaGateway?.id === d.id ? 'border: 2px solid var(--accent);' : ''} ${isSelected ? 'border: 2px solid var(--accent); background: var(--bg-secondary);' : ''}">
            <div class="device-header" style="display: flex; align-items: center; gap: 0.5rem;">
                ${canSelect ? `
                <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" 
                           ${isSelected ? 'checked' : ''} 
                           onchange="manager.selectDevice('${d.id}', this.checked); render();"
                           style="margin-right: 0.5rem; cursor: pointer; width: 18px; height: 18px;"
                           ${manager.isFlashing ? 'disabled' : ''}>
                </label>
                ` : '<span style="width: 1.5rem;"></span>'}
                <span class="device-name" style="flex: 1; cursor: pointer; font-weight: 600;" onclick="renameDevice('${d.id}')" title="Click to rename">
                    ${d.name}
                    ${isReady ? '<span style="font-size:0.65rem; color:var(--success); margin-left:0.5rem;">✓ Ready</span>' : ''}
                </span>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span style="font-size:0.7rem; color:var(--text-dim); text-transform: uppercase;">${d.connectionType}</span>
                    ${manager.otaGateway?.id === d.id ? '<span style="font-size:0.7rem; color:var(--accent);">🌐 GATEWAY</span>' : ''}
                    ${d.chipInfo ? `<span style="font-size:0.7rem; color:var(--success);">${d.chipInfo}</span>` : ''}
                    ${d.template ? `<span style="font-size:0.65rem; color:var(--accent);">📋 ${d.template.name}</span>` : ''}
                    <span class="status-pill status-${d.status}">${d.status}</span>
                    <button onclick="manager.removeDevice('${d.id}'); render();" style="background:none; border:none; color:var(--error); cursor:pointer; padding: 0.25rem; font-size: 1.2rem; line-height: 1;" ${manager.isFlashing ? 'disabled' : ''} title="Remove device">✕</button>
                </div>
            </div>
            <div class="progress-container">
                <div class="progress-bar" style="width: ${d.progress}%"></div>
            </div>
            <div style="font-size: 0.7rem; color: var(--text-dim); margin-bottom: 0.5rem;">${d.progress}%</div>
            <div class="telemetry-grid">
                <div class="telemetry-item">
                    <div class="telemetry-label">Battery</div>
                    <div class="telemetry-value">${d.telemetry.batt}V</div>
                </div>
                <div class="telemetry-item">
                    <div class="telemetry-label">SNR</div>
                    <div class="telemetry-value">${d.telemetry.snr}dB</div>
                </div>
                <div class="telemetry-item">
                    <div class="telemetry-label">Air Util</div>
                    <div class="telemetry-value">${d.telemetry.util}%</div>
                </div>
            </div>
            ${d.snrHistory && d.snrHistory.length > 0 ? `
                <div style="margin-top: 0.5rem;">
                    <div style="font-size: 0.7rem; color: var(--text-dim); margin-bottom: 0.25rem;">SNR Trend</div>
                    ${renderSNRChart(d.snrHistory, 200, 60)}
                </div>
            ` : ''}
            ${d.airUtilHistory && d.airUtilHistory.length > 0 ? `
                <div style="margin-top: 0.5rem;">
                    <div style="font-size: 0.7rem; color: var(--text-dim); margin-bottom: 0.25rem;">Air Utilization</div>
                    ${renderAirUtilChart(d.airUtilHistory, 200, 60)}
                </div>
            ` : ''}
            <div class="log-container">
                ${d.logs.slice(0, 20).map(l => `<div>${l}</div>`).join('')}
            </div>
        </div>
    `;
    }).join('');
    
    globalLog.innerHTML = manager.globalLogs.slice(0, 50).map(l => `<div>${l}</div>`).join('');
    
    const directCount = manager.devices.filter(d => d.connectionType !== 'ota').length;
    const otaCount = manager.devices.filter(d => d.connectionType === 'ota').length;
    const fwCount = manager.firmwareBinaries.length;
    const selectedCount = manager.getSelectionCount();
    
    batchStats.innerText = `${directCount} Direct | ${otaCount} OTA | ${fwCount} FW files | ${selectedCount > 0 ? `${selectedCount} Selected | ` : ''}${manager.isFlashing ? '⚡ FLASHING' : 'Ready'}`;
    
    // Update batch status indicator
    updateBatchStatus();
    updateButtons();
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

window.addPendingDevice = function(templateId) {
    const template = manager.getTemplate(templateId);
    if (!template) return;
    
    const customName = prompt(`Enter device name (or leave blank for "${template.deviceName}"):`, template.deviceName);
    if (customName === null) return; // User cancelled
    
    manager.addPendingDevice(templateId, customName || template.deviceName);
    renderTemplates();
    render();
};

window.deleteTemplate = function(templateId) {
    if (!confirm('Delete this template?')) return;
    manager.deleteTemplate(templateId);
    renderTemplates();
    render();
};

window.removePendingDevice = function(pendingId) {
    manager.removePendingDevice(pendingId);
    renderTemplates();
    render();
};

window.renameDevice = function(deviceId) {
    const device = manager.devices.find(d => d.id === deviceId);
    if (!device) return;
    
    const newName = prompt(`Rename device "${device.name}":`, device.name);
    if (newName && newName.trim()) {
        manager.renameDevice(deviceId, newName.trim());
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

// Initial render
render();
renderTemplates(); // Render templates on load
renderTemplates(); // Render templates on load
