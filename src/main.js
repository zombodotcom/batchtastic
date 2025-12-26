import { BatchManager } from './BatchManager.js';

const manager = new BatchManager();

// Make manager globally available for onclick handlers
window.manager = manager;
window.render = render;

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
    
    if (flashAllBtn) {
        flashAllBtn.disabled = !hasDirectDevices || manager.isFlashing || !hasFirmware;
    }
    if (otaBtn) {
        otaBtn.disabled = !hasOTATargets || !hasGateway || manager.isFlashing || !hasFirmware;
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
    
    deviceGrid.innerHTML = manager.devices.map(d => `
        <div class="device-card ${d.status === 'active' ? 'flashing' : ''}" style="${manager.otaGateway?.id === d.id ? 'border: 2px solid var(--accent);' : ''}">
            <div class="device-header">
                <span class="device-name">
                    ${d.name} 
                    <span style="font-size:0.7rem; color:var(--text-dim)">(${d.connectionType.toUpperCase()})</span>
                    ${manager.otaGateway?.id === d.id ? '<span style="font-size:0.6rem; color:var(--accent); margin-left:0.5rem;">🌐 GATEWAY</span>' : ''}
                    ${d.chipInfo ? `<span style="font-size:0.6rem; color:var(--success); margin-left:0.5rem;">${d.chipInfo}</span>` : ''}
                </span>
                <div>
                    <span class="status-pill status-${d.status}">${d.status}</span>
                    <button onclick="manager.removeDevice('${d.id}'); render();" style="background:none; border:none; color:var(--error); cursor:pointer; margin-left:0.5rem;" ${manager.isFlashing ? 'disabled' : ''}>✕</button>
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
            <div class="log-container">
                ${d.logs.slice(0, 20).map(l => `<div>${l}</div>`).join('')}
            </div>
        </div>
    `).join('');
    
    globalLog.innerHTML = manager.globalLogs.slice(0, 50).map(l => `<div>${l}</div>`).join('');
    
    const directCount = manager.devices.filter(d => d.connectionType !== 'ota').length;
    const otaCount = manager.devices.filter(d => d.connectionType === 'ota').length;
    const fwCount = manager.firmwareBinaries.length;
    
    batchStats.innerText = `${directCount} Direct | ${otaCount} OTA | ${fwCount} FW files | ${manager.isFlashing ? '⚡ FLASHING' : 'Ready'}`;
    
    updateButtons();
}

// Initial render
render();
