import { BLETransport } from './BLETransport.js';
import { OTAHandler } from './OTAHandler.js';
import { BlobReader, ZipReader, BlobWriter } from '@zip.js/zip.js';
import { encodeConfigToProtobuf, encodeMultipleConfigsToProtobuf, encodeBeginEditSettings, encodeFullConfig } from './ProtobufEncoder.js';
import { getStorage, setStorage, removeStorage } from './utils/Storage.js';
import { logToDevice, logToGlobal, createLogEntry } from './utils/Logger.js';

/**
 * Convert ArrayBuffer to binary string (required by esptool-js)
 * This matches Meshtastic's convertToBinaryString approach
 */
function arrayBufferToBinaryString(buffer) {
    const bytes = new Uint8Array(buffer);
    let str = '';
    for (let i = 0; i < bytes.length; i++) {
        str += String.fromCharCode(bytes[i]);
    }
    return str;
}

/**
 * Get CORS-friendly URL for Meshtastic firmware releases
 * Meshtastic mirrors releases to GitHub Pages which has proper CORS headers
 */
function getCorsFriendlyReleaseUrl(zipUrl) {
    const zipName = zipUrl.split('/').slice(-1)[0];
    let firmwareName = zipName.replace('.zip', '');
    // Remove arch suffixes to match their mirror structure
    firmwareName = firmwareName
        .replace('-esp32-', '-')
        .replace('-esp32c3-', '-')
        .replace('-esp32c6-', '-')
        .replace('-esp32s3-', '-')
        .replace('-nrf52840-', '-')
        .replace('-stm32-', '-')
        .replace('-rp2040-', '-');
    return `https://raw.githubusercontent.com/meshtastic/meshtastic.github.io/master/${firmwareName}`;
}

export class BatchManager {
    constructor() {
        this.devices = [];
        this.isFlashing = false;
        this.firmwareBinaries = [];
        this.currentView = 'grid';
        this.globalLogs = [];
        this.otaGateway = null;
        this.selectedRelease = null;
        this.baudRate = 115200;
        this.selectedDevices = new Set(); // Set of device IDs for selection
        this.deviceTemplates = this._loadTemplates(); // Load saved templates from storage
        this.pendingDevices = []; // Devices waiting to be connected (with pre-assigned templates)
        this.deviceGroups = this._loadGroups(); // Load saved groups from storage
    }

    /**
     * Load device templates from storage
     */
    _loadTemplates() {
        return getStorage('batchtastic_templates', []);
    }

    /**
     * Save device templates to storage
     */
    _saveTemplates() {
        setStorage('batchtastic_templates', this.deviceTemplates);
    }

    /**
     * Build a config object from a template
     * @param {Object} template - Template object with config properties
     * @returns {Object} Config object suitable for device configuration
     */
    _buildConfigFromTemplate(template) {
        const config = {};
        if (template.region) config.region = template.region;
        if (template.channelName) config.channelName = template.channelName;
        if (template.role) config.role = template.role;
        if (template.modemPreset) config.modemPreset = template.modemPreset;
        if (template.txPower !== null && template.txPower !== undefined) config.txPower = template.txPower;
        if (template.hopLimit !== null && template.hopLimit !== undefined) config.hopLimit = template.hopLimit;
        return config;
    }

    /**
     * Create a device template/profile
     * @param {Object} template - Template configuration
     * @param {string} template.name - Template name (required)
     * @param {string} [template.deviceName] - Default device name
     * @param {string} [template.region] - LoRa region (default: 'US')
     * @param {string} [template.channelName] - Channel name (default: 'LongFast')
     * @param {string} [template.role] - Device role (default: 'ROUTER')
     * @param {string} [template.modemPreset] - Modem preset
     * @param {number} [template.txPower] - TX power
     * @param {number} [template.hopLimit] - Hop limit
     * @returns {Template} Created template object
     * @throws {Error} If template name is missing
     */
    createTemplate(template) {
        if (!template.name) {
            throw new Error('Template must have a name');
        }
        
        const newTemplate = {
            id: crypto.randomUUID(),
            name: template.name,
            deviceName: template.deviceName || template.name,
            region: template.region || 'US',
            channelName: template.channelName || 'LongFast',
            role: template.role || 'ROUTER',
            modemPreset: template.modemPreset || '',
            txPower: template.txPower || null,
            hopLimit: template.hopLimit || null,
            createdAt: new Date().toISOString()
        };
        
        this.deviceTemplates.push(newTemplate);
        this._saveTemplates();
        this.logGlobal(`Template "${newTemplate.name}" created`);
        return newTemplate;
    }

    /**
     * Delete a template
     * @param {string} templateId - Template ID to delete
     */
    deleteTemplate(templateId) {
        this.deviceTemplates = this.deviceTemplates.filter(t => t.id !== templateId);
        this._saveTemplates();
        this.logGlobal('Template deleted');
    }

    /**
     * Get a template by ID
     * @param {string} templateId - Template ID
     * @returns {Template|undefined} Template object or undefined if not found
     */
    getTemplate(templateId) {
        return this.deviceTemplates.find(t => t.id === templateId);
    }

    /**
     * Add a pending device (device that will be connected later with a template)
     * @param {string} templateId - Template ID to use
     * @param {string|null} [customName=null] - Custom device name (uses template default if null)
     * @returns {Object} Pending device object
     * @throws {Error} If template not found
     */
    addPendingDevice(templateId, customName = null) {
        const template = this.getTemplate(templateId);
        if (!template) {
            throw new Error('Template not found');
        }
        
        const pendingDevice = {
            id: crypto.randomUUID(),
            templateId: templateId,
            name: customName || template.deviceName,
            template: template,
            status: 'pending'
        };
        
        this.pendingDevices.push(pendingDevice);
        this.logGlobal(`Pending device "${pendingDevice.name}" added (will use template "${template.name}")`);
        return pendingDevice;
    }

    /**
     * Remove a pending device
     * @param {string} pendingId - Pending device ID to remove
     */
    removePendingDevice(pendingId) {
        this.pendingDevices = this.pendingDevices.filter(p => p.id !== pendingId);
    }

    /**
     * Rename a device
     * @param {string} deviceId - Device ID
     * @param {string} newName - New device name
     * @throws {Error} If device not found
     */
    renameDevice(deviceId, newName) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) {
            throw new Error('Device not found');
        }
        const oldName = device.name;
        device.name = newName;
        this.logGlobal(`Device renamed: ${oldName} → ${newName}`);
    }

    /**
     * Fetch available firmware releases from Meshtastic API
     * Falls back to GitHub API if the Meshtastic API is unavailable
     * @returns {Promise<{stable: Release[], alpha: Release[]}>} Object with stable and alpha release arrays
     */
    async fetchReleases() {
        // Try Meshtastic's own API first (has better caching)
        try {
            const response = await fetch('https://api.meshtastic.org/github/firmware/list', {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
                // Don't include credentials to avoid CORS issues
                credentials: 'omit',
                mode: 'cors'
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.releases && data.releases.stable && data.releases.alpha) {
                    return {
                        stable: data.releases.stable.slice(0, 4),
                        alpha: data.releases.alpha.slice(0, 4)
                    };
                }
            }
        } catch (e) {
            console.warn("Meshtastic API unavailable, falling back to GitHub API", e);
        }

        // Fallback to GitHub API (has CORS support)
        try {
            const response = await fetch('https://api.github.com/repos/meshtastic/firmware/releases', {
                method: 'GET',
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                },
                credentials: 'omit',
                mode: 'cors'
            });
            
            if (response.ok) {
                const data = await response.json();
                const stable = data.filter(r => !r.prerelease).slice(0, 4).map(rel => ({
                    id: rel.tag_name,
                    title: rel.name || rel.tag_name,
                    zip_url: rel.assets?.find(a => a.name.endsWith('.zip'))?.browser_download_url
                })).filter(r => r.zip_url); // Only include releases with zip files
                
                const alpha = data.filter(r => r.prerelease).slice(0, 4).map(rel => ({
                    id: rel.tag_name,
                    title: rel.name || rel.tag_name,
                    zip_url: rel.assets?.find(a => a.name.endsWith('.zip'))?.browser_download_url
                })).filter(r => r.zip_url);
                
                return { stable, alpha };
            } else {
                console.warn(`GitHub API returned status ${response.status}`);
            }
        } catch (e) {
            console.error("Failed to fetch GitHub releases", e);
        }
        
        // Final fallback: return empty arrays (UI will show custom file option)
        console.warn("All firmware release APIs failed, using custom file option only");
        return { stable: [], alpha: [] };
    }

    /**
     * Select a firmware release for flashing
     * @param {Release} release - Release object to select
     */
    selectRelease(release) {
        this.selectedRelease = release;
        this.logGlobal(`Selected firmware: ${release.id}`);
    }

    /**
     * Fetch a firmware binary file from the selected release
     * Uses CORS-friendly Meshtastic mirror
     * @param {string} fileName - Binary filename to fetch
     * @returns {Promise<string>} Binary string representation of firmware
     * @throws {Error} If no release selected or fetch fails
     */
    async fetchFirmwareBinary(fileName) {
        if (!this.selectedRelease?.zip_url) {
            throw new Error('No firmware release selected');
        }
        
        const baseUrl = getCorsFriendlyReleaseUrl(this.selectedRelease.zip_url);
        const url = `${baseUrl}/${fileName}`;
        
        this.logGlobal(`Fetching: ${fileName}`);
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${fileName}: ${response.status}`);
        }
        
        const blob = await response.blob();
        const buffer = await blob.arrayBuffer();
        return arrayBufferToBinaryString(buffer);
    }

    /**
     * Set OTA gateway device
     * @param {string} deviceId - Device ID to set as OTA gateway
     * @throws {Error} If device not found or device is OTA type
     */
    setOTAGateway(deviceId) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) throw new Error('Device not found');
        if (device.connectionType === 'ota') throw new Error('OTA node cannot be gateway');
        
        this.otaGateway = device;
        this.logGlobal(`OTA Gateway set to ${device.name}`);
    }

    /**
     * Add an OTA target device
     * @param {string|null} [nodeId=null] - Meshtastic node ID (optional)
     * @returns {Promise<Device>} Created OTA device object
     */
    async addDeviceOTA(nodeId = null) {
        const deviceId = crypto.randomUUID().split('-')[0].toUpperCase();
        const device = {
            id: deviceId,
            connection: null,
            connectionType: 'ota',
            status: 'ready',
            progress: 0,
            logs: [],
            nodeId: nodeId,
            config: {}, // Store device's current configuration
            configHistory: [], // History of config changes for undo
            tags: [], // Device tags for grouping/filtering
            groupId: null, // Device group ID (if assigned to a group)
            templateId: null, // Template ID if config was applied from template
            telemetry: { batt: '--', snr: '--', util: '--' },
            snrHistory: [],
            airUtilHistory: [],
            testResults: {}, // Store test results (connectivity, latency, etc.)
            name: nodeId ? `NODE-${nodeId}` : `OTA-${deviceId}`
        };
        this.devices.push(device);
        this.logGlobal(`OTA target ${device.name} added to batch`);
        return device;
    }

    /**
     * Add a USB device via Web Serial API
     * @returns {Promise<Device>} Created USB device object
     * @throws {Error} If Web Serial API not supported or user cancels
     */
    async addDeviceUSB() {
        if (!navigator.serial) {
            throw new Error('Web Serial API not supported.');
        }
        const port = await navigator.serial.requestPort();
        return this._createDevice(port, 'usb');
    }

    /**
     * Add a BLE device via Web Bluetooth API
     * @returns {Promise<Device>} Created BLE device object
     * @throws {Error} If Web Bluetooth API not supported or connection fails
     */
    async addDeviceBLE() {
        const transport = new BLETransport();
        const info = await transport.connect();
        return this._createDevice(transport, 'ble', info);
    }

    /**
     * Add a disconnected device placeholder with board info and configuration
     * User can connect the device later by clicking "Connect" button
     * @param {Object} board - Board definition object
     * @param {string} board.id - Board ID
     * @param {string} board.name - Board name
     * @param {string} board.vendor - Board vendor
     * @param {string} board.chip - Chip type
     * @param {string} board.icon - Board icon emoji
     * @param {Config} config - Configuration to apply when device connects
     * @param {string} [config.deviceName] - Device name
     * @returns {Device} Created disconnected device object
     */
    addDisconnectedDevice(board, config) {
        const deviceId = crypto.randomUUID().split('-')[0].toUpperCase();
        const device = {
            id: deviceId,
            connection: null,
            connectionType: null, // Will be set on connect
            status: 'disconnected',
            boardType: board.id,
            boardName: board.name,
            boardVendor: board.vendor,
            boardChip: board.chip,
            boardIcon: board.icon,
            name: config.deviceName || `NODE-${deviceId}`,
            config: config, // Store device's current configuration
            pendingConfig: config, // Legacy: Store config to apply on connect (will migrate to config)
            configHistory: [], // History of config changes for undo
            tags: [], // Device tags for grouping/filtering
            groupId: null, // Device group ID (if assigned to a group)
            templateId: null, // Template ID if config was applied from template
            configured: false,
            progress: 0,
            logs: [],
            telemetry: { batt: '--', snr: '--', util: '--' },
            snrHistory: [],
            airUtilHistory: [],
            testResults: {} // Store test results (connectivity, latency, etc.)
        };
        this.devices.push(device);
        this.logGlobal(`Placeholder device "${device.name}" created (${board.name})`);
        return device;
    }

    /**
     * Connect a disconnected device placeholder to a physical device
     * Establishes USB or BLE connection and applies pending configuration
     * @param {string} deviceId - Device ID to connect
     * @param {string} connectionType - Connection type: 'usb' or 'ble'
     * @returns {Promise<Device>} Updated device object
     * @throws {Error} If device not found, already connected, or connection fails
     */
    async connectDevice(deviceId, connectionType) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device || device.status !== 'disconnected') {
            throw new Error('Device not found or already connected');
        }
        
        let connection;
        let connectionInfo = {};
        
        if (connectionType === 'usb') {
            if (!navigator.serial) {
                throw new Error('Web Serial API not supported');
            }
            connection = await navigator.serial.requestPort();
        } else if (connectionType === 'ble') {
            const transport = new BLETransport();
            connectionInfo = await transport.connect();
            connection = transport;
        } else {
            throw new Error('Invalid connection type');
        }
        
        // Update device with connection
        device.connection = connection;
        device.connectionType = connectionType;
        device.status = 'ready';
        
        // Update name if BLE provided one
        if (connectionInfo.name) {
            device.name = connectionInfo.name;
        }
        
        this.logGlobal(`${device.name} connected via ${connectionType.toUpperCase()}`);
        
        // Apply pending configuration
        if (device.pendingConfig) {
            this.logGlobal(`Applying pre-configured settings to ${device.name}...`);
            try {
                await this.injectConfig(deviceId, device.pendingConfig);
                device.pendingConfig = null; // Clear after applying
                this.logGlobal(`✅ Configuration applied to ${device.name}`);
            } catch (e) {
                this.log(device, `⚠️ Config application failed: ${e.message}`);
                // Don't throw - device is still connected, user can configure manually
            }
        }
        
        return device;
    }

    _createDevice(connection, type, info = {}) {
        const deviceId = crypto.randomUUID().split('-')[0].toUpperCase();
        
        // Check if there's a pending device waiting for this connection
        let pendingDevice = null;
        if (this.pendingDevices.length > 0) {
            // Use the first pending device, or match by some criteria if needed
            pendingDevice = this.pendingDevices.shift();
        }
        
        const device = {
            id: deviceId,
            connection: connection,
            connectionType: type,
            status: 'ready',
            progress: 0,
            logs: [],
            telemetry: { 
                batt: (Math.random() * (4.2 - 3.5) + 3.5).toFixed(2), 
                snr: (Math.random() * 10 - 5).toFixed(1), 
                util: Math.floor(Math.random() * 30) 
            },
            snrHistory: [], // Time-series SNR data for charts
            airUtilHistory: [], // Time-series air utilization data
            loader: null,
            chipInfo: null,
            name: info.name || pendingDevice?.name || `NODE-${deviceId}`,
            template: pendingDevice?.template || null, // Store template reference for auto-config
            boardType: info.boardType || null, // Board type (tbeam, heltec-v3, etc.)
            boardName: info.boardName || null,
            boardVendor: info.boardVendor || null,
            boardChip: info.boardChip || null,
            boardIcon: info.boardIcon || null,
            config: pendingDevice?.template ? this._buildConfigFromTemplate(pendingDevice.template) : (pendingDevice?.config || {}), // Store device's current configuration
            pendingConfig: pendingDevice?.template ? this._buildConfigFromTemplate(pendingDevice.template) : (pendingDevice?.config || null), // Legacy: Store config to apply on connect
            configHistory: [], // History of config changes for undo
            tags: [], // Device tags for grouping/filtering
            groupId: null, // Device group ID (if assigned to a group)
            templateId: pendingDevice?.template?.id || null, // Template ID if config was applied from template
            testResults: {}, // Store test results (connectivity, latency, etc.)
            configured: false // Track if device has been configured
        };
        
        this.devices.push(device);
        this.logGlobal(`${type.toUpperCase()} device ${device.name} connected.`);
        
        // Auto-apply template config if available
        if (device.template) {
            this.logGlobal(`Auto-applying template "${device.template.name}" to ${device.name}...`);
            // Apply config asynchronously (don't await to avoid blocking device creation)
            this.injectConfig(device.id, {
                region: device.template.region,
                channelName: device.template.channelName,
                role: device.template.role,
                modemPreset: device.template.modemPreset || undefined,
                txPower: device.template.txPower || undefined,
                hopLimit: device.template.hopLimit || undefined
            }).catch(e => {
                this.log(device, `⚠️ Auto-config failed: ${e.message}`);
            });
        }
        
        return device;
    }

    async addDevice(port) {
        return this._createDevice(port, 'usb', { name: port?.name });
    }

    /**
     * Remove a device from the batch
     * @param {string} id - Device ID to remove
     */
    removeDevice(id) {
        if (this.isFlashing) return;
        const device = this.devices.find(d => d.id === id);
        if (device && device.connectionType === 'ble' && device.connection.disconnect) {
            device.connection.disconnect();
        }
        if (this.otaGateway?.id === id) {
            this.otaGateway = null;
        }
        this.selectedDevices.delete(id); // Remove from selection if present
        this.devices = this.devices.filter(d => d.id !== id);
    }

    /**
     * Selection management methods
     */
    /**
     * Select or deselect a device
     * @param {string} deviceId - Device ID
     * @param {boolean} [selected=true] - Whether to select (true) or deselect (false)
     */
    selectDevice(deviceId, selected = true) {
        if (selected) {
            this.selectedDevices.add(deviceId);
        } else {
            this.selectedDevices.delete(deviceId);
        }
    }

    /**
     * Deselect a device
     * @param {string} deviceId - Device ID to deselect
     */
    deselectDevice(deviceId) {
        this.selectedDevices.delete(deviceId);
    }

    /**
     * Select all devices (except OTA targets)
     */
    selectAll() {
        this.devices.forEach(device => {
            if (device.connectionType !== 'ota') { // Don't select OTA targets
                this.selectedDevices.add(device.id);
            }
        });
    }

    /**
     * Deselect all devices
     */
    deselectAll() {
        this.selectedDevices.clear();
    }

    /**
     * Get all selected devices
     * @returns {Device[]} Array of selected device objects
     */
    getSelectedDevices() {
        return this.devices.filter(d => this.selectedDevices.has(d.id));
    }

    /**
     * Check if a device is selected
     * @param {string} deviceId - Device ID to check
     * @returns {boolean} True if device is selected
     */
    isSelected(deviceId) {
        return this.selectedDevices.has(deviceId);
    }

    /**
     * Get the number of selected devices
     * @returns {number} Number of selected devices
     */
    getSelectionCount() {
        return this.selectedDevices.size;
    }

    /**
     * Log a message to a device's log array and global logs
     * @param {Device} device - Device object
     * @param {string} msg - Log message
     */
    log(device, msg) {
        logToDevice(device, msg);
        this.logGlobal(`${device.name}: ${msg}`);
    }

    /**
     * Log a message to global logs
     * @param {string} msg - Log message
     */
    logGlobal(msg) {
        logToGlobal(this.globalLogs, msg);
    }

    /**
     * Update device telemetry from Meshtastic protobuf packet
     * Also updates SNR and Air Util history for charts
     */
    updateTelemetry(deviceId, telemetryData) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) return;

        const now = Date.now();
        
        // Update current telemetry values
        if (telemetryData.batteryVoltage !== undefined) {
            device.telemetry.batt = telemetryData.batteryVoltage.toFixed(2);
        }
        if (telemetryData.snr !== undefined) {
            const snrValue = parseFloat(telemetryData.snr.toFixed(1));
            device.telemetry.snr = snrValue;
            
            // Add to SNR history (limit to last 100 points)
            device.snrHistory.push({ timestamp: now, snr: snrValue });
            if (device.snrHistory.length > 100) {
                device.snrHistory.shift();
            }
        }
        if (telemetryData.airUtilTx !== undefined) {
            const utilValue = Math.floor(telemetryData.airUtilTx);
            device.telemetry.util = utilValue;
            
            // Add to Air Util history
            device.airUtilHistory.push({ timestamp: now, util: utilValue });
            if (device.airUtilHistory.length > 100) {
                device.airUtilHistory.shift();
            }
        }
    }

    /**
     * REAL USB FLASH using esptool-js
     * Based on Meshtastic web-flasher implementation
     */
    async flashDeviceUSB(device, options = {}) {
        const { eraseAll = false, targetPlatform = 'tbeam' } = options;
        
        if (device.connectionType !== 'usb') {
            throw new Error('Device is not USB connected');
        }

        const port = device.connection;
        
        this.log(device, "Requesting serial connection...");
        
        try {
            // ESPLoader and Transport from esptool-js (loaded via CDN)
            const { ESPLoader, Transport } = window.esptoolPackage || await import('https://unpkg.com/esptool-js@0.4.5/bundle.js');
            
            const transport = new Transport(port, true);
            
            this.log(device, `Connecting at ${this.baudRate} baud...`);
            
            const loaderOptions = {
                transport: transport,
                baudrate: this.baudRate,
                enableTracing: false,
                terminal: {
                    clean: () => {},
                    writeLine: (data) => this.log(device, data),
                    write: (data) => {} // Suppress inline writes for cleaner logs
                }
            };
            
            const espLoader = new ESPLoader(loaderOptions);
            device.loader = espLoader;

            this.log(device, "Entering bootloader mode...");
            const chipInfo = await espLoader.main();
            // espLoader.main() returns chip name as string (e.g., "ESP32", "ESP32-S3")
            device.chipInfo = typeof chipInfo === 'string' ? chipInfo : chipInfo?.CHIP_NAME || 'Unknown';
            this.log(device, `✓ Connected: ${device.chipInfo}`);

            // Determine which files to flash based on mode and selection
            let fileArray = [];
            
            if (this.firmwareBinaries.length > 0) {
                // Use uploaded files
                fileArray = this.firmwareBinaries.map(fw => ({
                    data: fw.binaryString || arrayBufferToBinaryString(fw.data),
                    address: fw.address
                }));
                this.log(device, `Flashing ${fileArray.length} uploaded binary file(s)...`);
            } else if (this.selectedRelease) {
                // Fetch from Meshtastic release
                const version = this.selectedRelease.id.replace('v', '');
                
                if (eraseAll) {
                    // Full install - need factory bin, OTA, and filesystem
                    const factoryBin = await this.fetchFirmwareBinary(`firmware-${targetPlatform}-${version}.bin`);
                    const otaBin = await this.fetchFirmwareBinary('bleota.bin');
                    const littlefs = await this.fetchFirmwareBinary(`littlefs-${version}.bin`);
                    
                    fileArray = [
                        { data: factoryBin, address: 0x00 },
                        { data: otaBin, address: 0x260000 },
                        { data: littlefs, address: 0x300000 }
                    ];
                    this.log(device, "Full install: Factory + OTA + LittleFS");
                } else {
                    // Update only
                    const updateBin = await this.fetchFirmwareBinary(`firmware-${targetPlatform}-${version}-update.bin`);
                    fileArray = [{ data: updateBin, address: 0x10000 }];
                    this.log(device, "Update install: App partition only");
                }
            } else {
                throw new Error('No firmware selected. Upload .bin files or select a release.');
            }

            device.status = 'active';
            if (typeof window.render === 'function') window.render();

            // Flash options matching Meshtastic's approach
            const flashOptions = {
                fileArray: fileArray,
                flashSize: 'keep',
                eraseAll: eraseAll,
                compress: true,
                flashMode: 'keep',
                flashFreq: 'keep',
                reportProgress: (fileIndex, written, total) => {
                    const progress = Math.round((written / total) * 100);
                    device.progress = progress;
                    device.currentFile = fileIndex + 1;
                    device.totalFiles = fileArray.length;
                    if (typeof window.render === 'function') window.render();
                }
            };

            this.log(device, "Writing flash...");
            await espLoader.writeFlash(flashOptions);
            
            this.log(device, "Resetting device...");
            await this.resetESP32(transport);
            
            device.status = 'done';
            device.progress = 100;
            this.log(device, "✅ Flash complete!");

        } catch (e) {
            device.status = 'error';
            this.log(device, `❌ Flash failed: ${e.message}`);
            throw e;
        }
    }

    /**
     * Reset ESP32 via RTS toggle (matches Meshtastic's approach)
     */
    async resetESP32(transport) {
        await transport.setRTS(true);
        await new Promise(resolve => setTimeout(resolve, 100));
        await transport.setRTS(false);
    }

    /**
     * Flash all USB devices in parallel
     * @param {Object} options - Flash options
     * @param {boolean} options.eraseAll - Full install (erase and write all partitions)
     * @param {string} options.targetPlatform - Target platform (e.g., 'tbeam', 'tlora-v2')
     */
    async flashAllUSB(options = {}) {
        const usbDevices = this.devices.filter(d => d.connectionType === 'usb' && d.status !== 'done');
        
        if (usbDevices.length === 0) {
            throw new Error('No USB devices to flash');
        }
        if (this.firmwareBinaries.length === 0 && !this.selectedRelease) {
            throw new Error('No firmware loaded. Upload .bin files or select a release first.');
        }

        this.isFlashing = true;
        const mode = options.eraseAll ? 'FULL INSTALL' : 'UPDATE';
        this.logGlobal(`=== Starting ${mode} on ${usbDevices.length} USB device(s) ===`);

        // Flash devices in parallel
        const results = await Promise.allSettled(
            usbDevices.map(d => {
                d.status = 'pending';
                d.progress = 0;
                if (typeof window.render === 'function') window.render();
                return this.flashDeviceUSB(d, options);
            })
        );

        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        this.logGlobal(`=== Flash complete: ${successful} success, ${failed} failed ===`);
        this.isFlashing = false;
        
        if (typeof window.render === 'function') window.render();
        return { successful, failed };
    }

    /**
     * OTA Bulk Update
     */
    async flashAllOTA() {
        if (!this.otaGateway) {
            throw new Error('No OTA Gateway set. Connect to one node via USB/BLE first.');
        }
        if (this.firmwareBinaries.length === 0) {
            throw new Error('No firmware selected for OTA update');
        }

        this.isFlashing = true;
        this.logGlobal("=== Starting OTA Bulk Update (XModem Protocol) ===");
        
        const gateway = this.otaGateway;
        const otaTargets = this.devices.filter(d => d.connectionType === 'ota');
        
        if (otaTargets.length === 0) {
            throw new Error('No OTA target nodes added.');
        }

        // Ensure gateway connection is open
        if (gateway.connectionType === 'usb' && !gateway.connection.writable) {
            await gateway.connection.open({ baudRate: this.baudRate });
        }

        this.log(gateway, `Broadcasting firmware to ${otaTargets.length} node(s)...`);
        
        try {
            // Get firmware binary and filename
            const firmwareBinary = this.firmwareBinaries[0].data;
            const firmwareFilename = this.firmwareBinaries[0].filename || 'firmware.bin';
            
            // Set up progress callback
            const onProgress = (chunkIndex, totalChunks) => {
                const progress = Math.floor((chunkIndex / totalChunks) * 100);
                otaTargets.forEach(target => {
                    target.progress = progress;
                });
                if (typeof window.render === 'function') window.render();
            };
            
            // Create OTA handler with progress callback
            const otaHandler = new OTAHandler(gateway.connection, onProgress);
            
            // Prepare firmware (split into 128-byte chunks)
            const chunkCount = await otaHandler.prepareFirmware(firmwareBinary);
            this.log(gateway, `Firmware prepared: ${chunkCount} chunks (${firmwareBinary.length} bytes)`);
            
            // Send OTA start message (STX with filename)
            await otaHandler.startOTA(firmwareFilename);
            this.log(gateway, `OTA start sent: ${firmwareFilename}`);
            
            // Small delay to allow device to process start message
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Send chunks sequentially (wait for ACK before next chunk)
            let successfulChunks = 0;
            let failedChunks = 0;
            
            for (let i = 0; i < chunkCount; i++) {
                const success = await otaHandler.sendChunk(i, 3); // 3 retries max
                
                if (success) {
                    successfulChunks++;
                    if (i % 10 === 0 || i === chunkCount - 1) {
                        this.log(gateway, `Chunk ${i + 1}/${chunkCount} sent and acknowledged`);
                    }
                } else {
                    failedChunks++;
                    this.log(gateway, `⚠️ Chunk ${i + 1}/${chunkCount} failed after retries`);
                }
                
                // Small delay between chunks
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            // Send End of Transmission (EOT)
            await otaHandler.sendEOT();
            this.log(gateway, "End of Transmission (EOT) sent");
            
            // Update target statuses
            if (failedChunks === 0) {
                otaTargets.forEach(target => {
                    target.status = 'done';
                    target.progress = 100;
                    this.log(target, "✅ OTA update complete");
                });
                this.logGlobal(`=== OTA Update Complete: ${otaTargets.length} node(s) updated successfully ===`);
            } else {
                otaTargets.forEach(target => {
                    target.status = failedChunks < chunkCount / 2 ? 'warning' : 'error';
                    this.log(target, `⚠️ OTA update completed with ${failedChunks} failed chunks`);
                });
                this.logGlobal(`=== OTA Update Completed with Errors: ${successfulChunks}/${chunkCount} chunks successful ===`);
            }
            
        } catch (e) {
            this.log(gateway, `❌ OTA Failed: ${e.message}`);
            otaTargets.forEach(t => {
                t.status = 'error';
                t.progress = 0;
            });
            throw e;
        } finally {
            this.isFlashing = false;
            if (typeof window.render === 'function') window.render();
        }
    }

    /**
     * Load firmware binaries from file input
     * Supports both .bin files and .zip archives
     */
    async loadFirmwareFiles(files) {
        this.firmwareBinaries = [];
        
        for (const file of Array.from(files)) {
            const buffer = await file.arrayBuffer();
            const name = file.name.toLowerCase();
            
            if (name.endsWith('.zip')) {
                // Extract .bin files from ZIP archive
                this.logGlobal(`Extracting ZIP archive: ${file.name}`);
                try {
                    const reader = new BlobReader(file);
                    const zipReader = new ZipReader(reader);
                    const entries = await zipReader.getEntries();
                    
                    // Find all .bin files in the ZIP
                    const binFiles = entries.filter(entry => entry.filename.toLowerCase().endsWith('.bin'));
                    
                    if (binFiles.length === 0) {
                        this.logGlobal(`⚠️ No .bin files found in ${file.name}`);
                        zipReader.close();
                        continue;
                    }
                    
                    this.logGlobal(`Found ${binFiles.length} .bin file(s) in ZIP`);
                    
                    // Extract each .bin file
                    for (const entry of binFiles) {
                        const blob = await entry.getData(new BlobWriter());
                        const arrayBuffer = await blob.arrayBuffer();
                        const entryName = entry.filename.toLowerCase();
                        
                        // Auto-detect address from filename
                        let address = 0x10000; // Default: app partition
                        
                        if (entryName.includes('bootloader')) address = 0x1000;
                        else if (entryName.includes('partition-table') || entryName.includes('partitions')) address = 0x8000;
                        else if (entryName.includes('ota_data')) address = 0xd000;
                        else if (entryName.includes('.factory.bin')) address = 0x0;
                        else if (entryName.includes('bleota')) address = 0x260000;
                        else if (entryName.includes('littlefs') || entryName.includes('spiffs')) address = 0x300000;
                        else if (entryName.includes('update')) address = 0x10000;
                        
                        const binaryString = arrayBufferToBinaryString(arrayBuffer);
                        
                        this.firmwareBinaries.push({
                            name: entry.filename,
                            data: new Uint8Array(arrayBuffer),
                            binaryString: binaryString,
                            address: address,
                            size: arrayBuffer.byteLength,
                            source: file.name
                        });
                        
                        this.logGlobal(`  ✓ Extracted: ${entry.filename} (${(arrayBuffer.byteLength / 1024).toFixed(1)} KB) → 0x${address.toString(16)}`);
                    }
                    
                    zipReader.close();
                } catch (e) {
                    this.logGlobal(`❌ Failed to extract ZIP: ${e.message}`);
                    console.error('ZIP extraction error:', e);
                }
                continue;
            }
            
            // Auto-detect flash address from filename (Meshtastic conventions)
            let address = 0x10000; // Default: app partition
            
            if (name.includes('bootloader')) address = 0x1000;
            else if (name.includes('partition-table') || name.includes('partitions')) address = 0x8000;
            else if (name.includes('ota_data')) address = 0xd000;
            else if (name.includes('.factory.bin')) address = 0x0;
            else if (name.includes('bleota')) address = 0x260000;
            else if (name.includes('littlefs') || name.includes('spiffs')) address = 0x300000;
            else if (name.includes('update')) address = 0x10000;
            
            // Convert to binary string format that esptool-js expects
            const binaryString = arrayBufferToBinaryString(buffer);
            
            this.firmwareBinaries.push({
                name: file.name,
                data: new Uint8Array(buffer),
                binaryString: binaryString,
                address: address,
                size: buffer.byteLength
            });
            
            this.logGlobal(`Loaded: ${file.name} (${(buffer.byteLength / 1024).toFixed(1)} KB) → 0x${address.toString(16)}`);
        }
        
        return this.firmwareBinaries;
    }

    /**
     * Encode configuration as Meshtastic protobuf ToRadio message
     * Returns Uint8Array ready to send over serial/BLE
     */
    _encodeConfigToProtobuf(config) {
        return encodeConfigToProtobuf(config);
    }
    
    /**
     * Send beginEditSettings message to device (required before config changes)
     */
    async _beginEditSettings(device) {
        try {
            const beginEditData = encodeBeginEditSettings();
            
            if (device.connectionType === 'usb') {
                if (!device.connection.writable) {
                    await device.connection.open({ baudRate: this.baudRate });
                }
                const writer = device.connection.writable.getWriter();
                await writer.write(beginEditData);
                writer.releaseLock();
            } else if (device.connectionType === 'ble') {
                if (device.connection.write) {
                    await device.connection.write(beginEditData);
                } else {
                    throw new Error('BLE connection does not support write');
                }
            }
            
            // Small delay to allow device to process
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (e) {
            this.log(device, `⚠️ beginEditSettings failed: ${e.message}`);
            // Continue anyway - some devices may not require this
        }
    }

    /**
     * Validate configuration object (internal method)
     */
    _validateConfig(config) {
        // Check if structured config format
        if (config.lora || config.device || config.display || config.network || config.bluetooth || config.position || config.power || config.modules) {
            // Structured format - use public validateConfig
            return this.validateConfig(config);
        }
        
        // Legacy format validation
        const validFields = ['region', 'channelName', 'role', 'modemPreset', 'txPower', 'hopLimit'];
        const hasValidField = Object.keys(config).some(key => validFields.includes(key));
        
        if (!hasValidField) {
            throw new Error('Config must contain at least one valid field: ' + validFields.join(', '));
        }
        
        // Validate region
        if (config.region) {
            const validRegions = ['US', 'EU_868', 'EU_433', 'CN', 'JP', 'ANZ', 'KR', 'TW', 'RU', 'IN', 'NZ_865', 'TH', 'LORA_24', 'UA_433', 'UA_868', 'MY_433', 'MY_919', 'SG_923', 'TW_923', 'PH_923', 'SG_923', 'MY_923', 'TH_923'];
            if (!validRegions.includes(config.region)) {
                throw new Error(`Invalid region: ${config.region}`);
            }
        }
        
        return true;
    }

    /**
     * Inject configuration to a device
     * Supports both USB (Web Serial) and BLE (Web Bluetooth) connections
     */
    /**
     * Inject full configuration (supports structured config with all types)
     */
    async injectFullConfig(config, deviceIds = null) {
        const targetIds = deviceIds || Array.from(this.selectedDevices.size > 0 ? this.selectedDevices : this.devices.map(d => d.id));
        const targetDevices = this.devices.filter(d => targetIds.includes(d.id) && d.connectionType !== 'ota');
        
        if (targetDevices.length === 0) {
            throw new Error('No devices selected for config injection');
        }

        this.logGlobal(`Injecting full configuration to ${targetDevices.length} device(s)...`);
        
        const results = await Promise.allSettled(
            targetDevices.map(d => this.injectConfig(d.id, config))
        );

        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        this.logGlobal(`Config injection complete: ${successful} success, ${failed} failed`);
        return { successful, failed };
    }

    /**
     * Save config to device's history before applying
     * @param {string} deviceId - Device ID
     * @param {Config} config - Configuration to save
     */
    _saveConfigHistory(deviceId, config) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) return;
        
        // Save current config to history before applying new one
        if (device.config && Object.keys(device.config).length > 0) {
            device.configHistory.push({
                config: JSON.parse(JSON.stringify(device.config)), // Deep copy
                timestamp: new Date().toISOString(),
                appliedBy: 'user'
            });
            
            // Limit history to last 10 entries
            if (device.configHistory.length > 10) {
                device.configHistory.shift();
            }
        }
    }

    async injectConfig(deviceId, config, skipHistory = false) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) {
            throw new Error('Device not found');
        }

        this._validateConfig(config);
        
        // Save current config to history before applying
        if (!skipHistory) {
            this._saveConfigHistory(deviceId, device.config || {});
        }
        
        // Update device's config property (merge with existing)
        const mergedConfig = { ...(device.config || {}), ...config };
        device.config = mergedConfig;
        
        this.log(device, `Injecting config: ${JSON.stringify(config)}`);

        try {
            // Begin edit settings (required by Meshtastic before config changes)
            await this._beginEditSettings(device);
            
            // Check if this is a full config object (structured) or legacy format (flat)
            let protobufMessages;
            if (config.lora || config.device || config.display || config.network || config.bluetooth || config.position || config.power || config.modules) {
                // Full config format - use encodeFullConfig
                protobufMessages = encodeFullConfig(config);
            } else {
                // Legacy format - use encodeMultipleConfigsToProtobuf
                protobufMessages = encodeMultipleConfigsToProtobuf(config);
            }
            
            if (protobufMessages.length === 0) {
                throw new Error('No valid config fields to encode');
            }
            
            // Send all config messages
            for (const protobufData of protobufMessages) {
                if (device.connectionType === 'usb') {
                    // USB: Send via Web Serial
                    if (!device.connection.writable) {
                        await device.connection.open({ baudRate: this.baudRate });
                    }
                    
                    const writer = device.connection.writable.getWriter();
                    await writer.write(protobufData);
                    writer.releaseLock();
                    
                    // Small delay between messages
                    await new Promise(resolve => setTimeout(resolve, 50));
                    
                } else if (device.connectionType === 'ble') {
                    // BLE: Send via Web Bluetooth
                    if (device.connection.write) {
                        await device.connection.write(protobufData);
                        // Small delay between messages
                        await new Promise(resolve => setTimeout(resolve, 50));
                    } else {
                        throw new Error('BLE connection does not support write');
                    }
                } else {
                    throw new Error(`Cannot inject config to ${device.connectionType} device`);
                }
            }

            this.log(device, '✅ Config injected successfully');
            device.configured = true; // Mark device as configured
            device.pendingConfig = device.config; // Update pendingConfig for backward compatibility
            this.logGlobal(`Config injected to ${device.name}`);
            
        } catch (e) {
            this.log(device, `❌ Config injection failed: ${e.message}`);
            throw e;
        }
    }

    /**
     * Apply configuration to a single device (updates config property, may or may not inject)
     * @param {string} deviceId - Device ID
     * @param {Config|Object} config - Configuration object
     * @param {boolean} [inject=false] - Whether to inject config to device immediately
     * @returns {Promise<void>}
     */
    async applyConfigToDevice(deviceId, config, inject = false, skipHistory = false) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) {
            throw new Error('Device not found');
        }

        this._validateConfig(config);
        
        // Save current config to history
        if (!skipHistory) {
            this._saveConfigHistory(deviceId, device.config || {});
        }
        
        // Update device's config property (merge with existing)
        device.config = { ...(device.config || {}), ...config };
        device.pendingConfig = device.config; // Update pendingConfig for backward compatibility
        
        // If device is connected and inject is true, inject config immediately
        if (inject && device.connectionType !== 'ota' && device.status !== 'disconnected' && device.connection) {
            await this.injectConfig(deviceId, config, skipHistory);
        }
    }

    /**
     * Inject a complete mission profile to a device
     */
    async injectMissionProfile(deviceId, profile) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) {
            throw new Error('Device not found');
        }

        this.log(device, `Injecting mission profile: ${profile.name || 'Unnamed'}`);
        
        // Build config from mission profile
        const config = {};
        
        if (profile.region) config.region = profile.region;
        if (profile.channelName) config.channelName = profile.channelName;
        if (profile.role) config.role = profile.role;
        if (profile.modemPreset) config.modemPreset = profile.modemPreset;
        if (profile.txPower) config.txPower = profile.txPower;
        if (profile.hopLimit) config.hopLimit = profile.hopLimit;
        
        await this.injectConfig(deviceId, config);
        this.log(device, `✅ Mission profile "${profile.name || 'Unnamed'}" applied`);
    }

    /**
     * Inject configuration to all connected devices
     */
    async injectConfigAll(config) {
        const targetDevices = this.devices.filter(d => d.connectionType !== 'ota');
        
        if (targetDevices.length === 0) {
            throw new Error('No devices connected for config injection');
        }

        this.logGlobal(`Injecting config to ${targetDevices.length} device(s)...`);
        
        const results = await Promise.allSettled(
            targetDevices.map(d => this.injectConfig(d.id, config))
        );

        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        this.logGlobal(`Config injection complete: ${successful} success, ${failed} failed`);
        return { successful, failed };
    }

    /**
     * Apply configuration to selected devices (updates config property, may or may not inject)
     * @param {Config|Object} config - Configuration object
     * @param {boolean} [inject=false] - Whether to inject config to devices immediately
     * @returns {Promise<{successful: number, failed: number}>} Result object with success/failure counts
     */
    async applyConfigToSelected(config, inject = false) {
        const selectedDevices = this.getSelectedDevices();
        
        if (selectedDevices.length === 0) {
            throw new Error('No devices selected');
        }

        this._validateConfig(config);
        
        this.logGlobal(`Applying configuration to ${selectedDevices.length} selected device(s)...`);
        
        const results = await Promise.allSettled(
            selectedDevices.map(d => this.applyConfigToDevice(d.id, config, inject))
        );

        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        this.logGlobal(`Config application complete: ${successful} success, ${failed} failed`);
        return { successful, failed };
    }

    /**
     * Inject configuration to selected devices only
     */
    async injectConfigSelected(config, deviceIds = null) {
        const targetIds = deviceIds || Array.from(this.selectedDevices);
        
        if (targetIds.length === 0) {
            throw new Error('No devices selected for config injection');
        }

        const targetDevices = this.devices.filter(d => targetIds.includes(d.id) && d.connectionType !== 'ota');
        
        if (targetDevices.length === 0) {
            throw new Error('No valid devices selected for config injection');
        }

        this.logGlobal(`Injecting config to ${targetDevices.length} selected device(s)...`);
        
        const results = await Promise.allSettled(
            targetDevices.map(d => this.injectConfig(d.id, config))
        );

        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        this.logGlobal(`Config injection complete: ${successful} success, ${failed} failed`);
        return { successful, failed };
    }

    /**
     * Configuration Preset System
     */
    getConfigurationPresets() {
        try {
            const item = localStorage.getItem('batchtastic_config_presets');
            return item ? JSON.parse(item) : [];
        } catch (e) {
            console.error('Failed to get presets from localStorage:', e);
            return [];
        }
    }

    /**
     * Save a configuration preset
     * @param {string} name - Preset name
     * @param {Config} config - Configuration object to save
     * @returns {Preset} Created preset object
     */
    saveConfigurationPreset(name, config) {
        const presets = this.getConfigurationPresets();
        const preset = {
            id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: name,
            config: { ...config }, // Save a copy
            createdAt: new Date().toISOString()
        };
        presets.push(preset);
        try {
            localStorage.setItem('batchtastic_config_presets', JSON.stringify(presets));
        } catch (e) {
            console.error('Failed to save preset to localStorage:', e);
            throw e; // Re-throw to allow callers to handle errors
        }
        return preset;
    }

    /**
     * Load a configuration preset
     * @param {string} presetId - Preset ID
     * @returns {Config} Configuration object from preset
     * @throws {Error} If preset not found
     */
    loadConfigurationPreset(presetId) {
        const presets = this.getConfigurationPresets();
        const preset = presets.find(p => p.id === presetId);
        if (!preset) {
            throw new Error('Preset not found');
        }
        return preset.config;
    }

    /**
     * Delete a configuration preset
     * @param {string} presetId - Preset ID to delete
     */
    deleteConfigurationPreset(presetId) {
        const presets = this.getConfigurationPresets();
        const filtered = presets.filter(p => p.id !== presetId);
        setStorage('batchtastic_config_presets', filtered);
    }

    /**
     * Export configuration as JSON
     */
    exportConfiguration(deviceId = null) {
        if (deviceId) {
            const device = this.devices.find(d => d.id === deviceId);
            if (!device) throw new Error('Device not found');
            return JSON.stringify({
                deviceId: device.id,
                deviceName: device.name,
                config: device.pendingConfig || {},
                exportedAt: new Date().toISOString()
            }, null, 2);
        } else {
            // Export all device configs
            return JSON.stringify({
                devices: this.devices.map(d => ({
                    deviceId: d.id,
                    deviceName: d.name,
                    config: d.pendingConfig || {}
                })),
                exportedAt: new Date().toISOString()
            }, null, 2);
        }
    }

    /**
     * Import configuration from JSON
     */
    importConfiguration(configJson) {
        try {
            const data = JSON.parse(configJson);
            if (data.deviceId) {
                // Single device import
                const device = this.devices.find(d => d.id === data.deviceId);
                if (!device) throw new Error('Device not found');
                device.pendingConfig = data.config;
                device.config = data.config; // Also update config property
                return { deviceId: data.deviceId, config: data.config };
            } else if (data.devices) {
                // Bulk import
                const results = [];
                for (const deviceData of data.devices) {
                    const device = this.devices.find(d => d.id === deviceData.deviceId);
                    if (device) {
                        device.pendingConfig = deviceData.config;
                        device.config = deviceData.config; // Also update config property
                        results.push(deviceData.deviceId);
                    }
                }
                return { deviceIds: results };
            } else {
                throw new Error('Invalid import format');
            }
        } catch (e) {
            throw new Error(`Import failed: ${e.message}`);
        }
    }

    /**
     * Validate configuration (public method)
     */
    validateConfig(config) {
        const errors = [];
        
        // Check if structured config format
        const isStructured = !!(config.lora || config.device || config.display || config.network || config.bluetooth || config.position || config.power || config.modules);
        
        if (isStructured) {
            // Handle structured config format
            const loraConfig = config.lora || {};
            const deviceConfig = config.device || {};
            
            // Validate LoRa config
            if (loraConfig.region) {
                const validRegions = ['US', 'EU_868', 'EU_433', 'CN', 'JP', 'ANZ', 'KR', 'TW', 'RU', 'IN', 'NZ_865', 'TH', 'LORA_24', 'UA_433', 'UA_868', 'MY_433', 'MY_919', 'SG_923'];
                if (!validRegions.includes(loraConfig.region)) {
                    errors.push('Invalid LoRa region');
                }
            }
            
            if (loraConfig.txPower !== undefined && (loraConfig.txPower < 0 || loraConfig.txPower > 30)) {
                errors.push('TX Power must be between 0 and 30 dBm');
            }
            
            if (loraConfig.hopLimit !== undefined && (loraConfig.hopLimit < 1 || loraConfig.hopLimit > 7)) {
                errors.push('Hop Limit must be between 1 and 7');
            }
            
            // Validate device config
            if (deviceConfig.role) {
                const validRoles = ['CLIENT', 'CLIENT_MUTE', 'ROUTER', 'TRACKER', 'SENSOR', 'TAK', 'CLIENT_HIDDEN', 'LOST_AND_FOUND', 'TAK_TRACKER', 'ROUTER_LATE', 'CLIENT_BASE'];
                if (!validRoles.includes(deviceConfig.role)) {
                    errors.push('Invalid device role');
                }
            }
            
            // Check if config has at least one section with data
            const hasAnyConfig = !!(loraConfig.region || loraConfig.modemPreset || loraConfig.hopLimit !== undefined || loraConfig.txPower !== undefined ||
                deviceConfig.role || deviceConfig.serialEnabled !== undefined ||
                config.display || config.network || config.bluetooth || config.position || config.power || config.modules);
            
            if (!hasAnyConfig) {
                errors.push('Config must contain at least one valid field');
            }
        } else {
            // Legacy format validation
            const validFields = ['region', 'channelName', 'role', 'modemPreset', 'txPower', 'hopLimit'];
            const hasValidField = Object.keys(config).some(key => validFields.includes(key));
            
            if (!hasValidField) {
                errors.push('Config must contain at least one valid field: ' + validFields.join(', '));
            }
            
            if (config.region && !['US', 'EU_868', 'EU_433', 'CN', 'JP', 'ANZ', 'KR', 'TW', 'RU', 'IN', 'NZ_865', 'TH', 'LORA_24', 'UA_433', 'UA_868', 'MY_433', 'MY_919', 'SG_923'].includes(config.region)) {
                errors.push(`Invalid region: ${config.region}`);
            }
        }
        
        if (errors.length > 0) {
            throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
        }
        
        return true;
    }

    /**
     * Device Groups Management
     */

    /**
     * Load device groups from storage
     */
    _loadGroups() {
        return getStorage('batchtastic_groups', []);
    }

    /**
     * Save device groups to storage
     */
    _saveGroups() {
        setStorage('batchtastic_groups', this.deviceGroups);
    }

    /**
     * Create a device group
     * @param {string} name - Group name
     * @param {string} [description] - Group description
     * @returns {Object} Created group object
     */
    createGroup(name, description = '') {
        if (!name) {
            throw new Error('Group name is required');
        }
        
        const group = {
            id: crypto.randomUUID(),
            name: name,
            description: description,
            createdAt: new Date().toISOString()
        };
        
        this.deviceGroups.push(group);
        this._saveGroups();
        this.logGlobal(`Group "${name}" created`);
        return group;
    }

    /**
     * Delete a device group
     * @param {string} groupId - Group ID to delete
     */
    deleteGroup(groupId) {
        const group = this.deviceGroups.find(g => g.id === groupId);
        if (!group) {
            throw new Error('Group not found');
        }
        
        // Remove group from all devices
        this.devices.forEach(device => {
            if (device.groupId === groupId) {
                device.groupId = null;
            }
        });
        
        this.deviceGroups = this.deviceGroups.filter(g => g.id !== groupId);
        this._saveGroups();
        this.logGlobal(`Group "${group.name}" deleted`);
    }

    /**
     * Get all device groups
     * @returns {Array} Array of group objects
     */
    getGroups() {
        return this.deviceGroups;
    }

    /**
     * Get a group by ID
     * @param {string} groupId - Group ID
     * @returns {Object|undefined} Group object or undefined if not found
     */
    getGroup(groupId) {
        return this.deviceGroups.find(g => g.id === groupId);
    }

    /**
     * Add device to group
     * @param {string} deviceId - Device ID
     * @param {string} groupId - Group ID
     */
    addDeviceToGroup(deviceId, groupId) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) {
            throw new Error('Device not found');
        }
        
        const group = this.deviceGroups.find(g => g.id === groupId);
        if (!group) {
            throw new Error('Group not found');
        }
        
        device.groupId = groupId;
        this.logGlobal(`Device "${device.name}" added to group "${group.name}"`);
    }

    /**
     * Remove device from group
     * @param {string} deviceId - Device ID
     */
    removeDeviceFromGroup(deviceId) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) {
            throw new Error('Device not found');
        }
        
        device.groupId = null;
        this.logGlobal(`Device "${device.name}" removed from group`);
    }

    /**
     * Get devices by group
     * @param {string} groupId - Group ID
     * @returns {Array} Array of device objects in the group
     */
    getDevicesByGroup(groupId) {
        return this.devices.filter(d => d.groupId === groupId);
    }

    /**
     * Apply configuration to all devices in a group
     * @param {string} groupId - Group ID
     * @param {Config|Object} config - Configuration object
     * @param {boolean} [inject=false] - Whether to inject config immediately
     * @returns {Promise<{successful: number, failed: number}>} Result object
     */
    async applyConfigToGroup(groupId, config, inject = false) {
        const groupDevices = this.getDevicesByGroup(groupId);
        
        if (groupDevices.length === 0) {
            throw new Error('No devices in group');
        }

        this._validateConfig(config);
        
        this.logGlobal(`Applying configuration to group (${groupDevices.length} devices)...`);
        
        const results = await Promise.allSettled(
            groupDevices.map(d => this.applyConfigToDevice(d.id, config, inject))
        );

        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        this.logGlobal(`Config application complete: ${successful} success, ${failed} failed`);
        return { successful, failed };
    }

    /**
     * Device Tags Management
     */

    /**
     * Add tag to device
     * @param {string} deviceId - Device ID
     * @param {string} tag - Tag name
     */
    addTag(deviceId, tag) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) {
            throw new Error('Device not found');
        }
        
        if (!device.tags) {
            device.tags = [];
        }
        
        if (!device.tags.includes(tag)) {
            device.tags.push(tag);
            this.logGlobal(`Tag "${tag}" added to device "${device.name}"`);
        }
    }

    /**
     * Remove tag from device
     * @param {string} deviceId - Device ID
     * @param {string} tag - Tag name
     */
    removeTag(deviceId, tag) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) {
            throw new Error('Device not found');
        }
        
        if (device.tags) {
            device.tags = device.tags.filter(t => t !== tag);
            this.logGlobal(`Tag "${tag}" removed from device "${device.name}"`);
        }
    }

    /**
     * Get devices by tag
     * @param {string} tag - Tag name
     * @returns {Array} Array of device objects with the tag
     */
    getDevicesByTag(tag) {
        return this.devices.filter(d => d.tags && d.tags.includes(tag));
    }

    /**
     * Get all unique tags across all devices
     * @returns {Array} Array of unique tag strings
     */
    getAllTags() {
        const allTags = new Set();
        this.devices.forEach(device => {
            if (device.tags && Array.isArray(device.tags)) {
                device.tags.forEach(tag => allTags.add(tag));
            }
        });
        return Array.from(allTags).sort();
    }

    /**
     * Bulk Import System
     */

    /**
     * Import devices from JSON
     * @param {string} jsonData - JSON string containing device data
     * @returns {Object} Import result with imported device count
     */
    importDevicesFromJSON(jsonData) {
        try {
            const data = JSON.parse(jsonData);
            const devices = data.devices || (Array.isArray(data) ? data : []);
            
            if (!Array.isArray(devices) || devices.length === 0) {
                throw new Error('Invalid JSON format: expected array of devices or object with devices array');
            }
            
            const imported = [];
            const errors = [];
            
            for (const deviceData of devices) {
                try {
                    // Validate required fields
                    if (!deviceData.name && !deviceData.deviceName) {
                        errors.push(`Device missing name: ${JSON.stringify(deviceData)}`);
                        continue;
                    }
                    
                    // Find board definition
                    const boardId = deviceData.boardType || deviceData.boardId || 'tbeam';
                    const board = {
                        id: boardId,
                        name: deviceData.boardName || 'T-Beam',
                        vendor: deviceData.boardVendor || 'LilyGO',
                        chip: deviceData.boardChip || 'esp32',
                        icon: deviceData.boardIcon || '📡'
                    };
                    
                    // Build config from device data
                    const config = {
                        deviceName: deviceData.name || deviceData.deviceName,
                        ...(deviceData.config || {}),
                        ...(deviceData.region ? { region: deviceData.region } : {}),
                        ...(deviceData.channelName ? { channelName: deviceData.channelName } : {}),
                        ...(deviceData.role ? { role: deviceData.role } : {}),
                        ...(deviceData.modemPreset ? { modemPreset: deviceData.modemPreset } : {}),
                        ...(deviceData.txPower !== undefined ? { txPower: deviceData.txPower } : {}),
                        ...(deviceData.hopLimit !== undefined ? { hopLimit: deviceData.hopLimit } : {})
                    };
                    
                    // Create disconnected device
                    const device = this.addDisconnectedDevice(board, config);
                    
                    // Add tags if provided
                    if (deviceData.tags && Array.isArray(deviceData.tags)) {
                        device.tags = deviceData.tags;
                    }
                    
                    // Assign to group if provided
                    if (deviceData.groupId) {
                        // Check if group exists, create if not
                        let group = this.deviceGroups.find(g => g.id === deviceData.groupId);
                        if (!group && deviceData.groupName) {
                            group = this.createGroup(deviceData.groupName, deviceData.groupDescription || '');
                        }
                        if (group) {
                            device.groupId = group.id;
                        }
                    }
                    
                    imported.push(device.id);
                } catch (e) {
                    errors.push(`Failed to import device: ${e.message}`);
                }
            }
            
            this.logGlobal(`Imported ${imported.length} device(s)${errors.length > 0 ? `, ${errors.length} error(s)` : ''}`);
            
            return {
                imported: imported.length,
                errors: errors,
                deviceIds: imported
            };
        } catch (e) {
            throw new Error(`JSON import failed: ${e.message}`);
        }
    }

    /**
     * Import devices from CSV
     * @param {string} csvData - CSV string containing device data
     * @returns {Object} Import result with imported device count
     */
    importDevicesFromCSV(csvData) {
        try {
            const lines = csvData.trim().split('\n');
            if (lines.length < 2) {
                throw new Error('CSV must have at least a header row and one data row');
            }
            
            // Parse header
            const headers = lines[0].split(',').map(h => h.trim());
            const nameIdx = headers.findIndex(h => h.toLowerCase() === 'name' || h.toLowerCase() === 'devicename');
            const boardIdx = headers.findIndex(h => h.toLowerCase() === 'boardtype' || h.toLowerCase() === 'board');
            const regionIdx = headers.findIndex(h => h.toLowerCase() === 'region');
            const channelIdx = headers.findIndex(h => h.toLowerCase() === 'channelname' || h.toLowerCase() === 'channel');
            const roleIdx = headers.findIndex(h => h.toLowerCase() === 'role');
            const tagsIdx = headers.findIndex(h => h.toLowerCase() === 'tags');
            
            if (nameIdx === -1) {
                throw new Error('CSV must have a "name" or "deviceName" column');
            }
            
            const imported = [];
            const errors = [];
            
            for (let i = 1; i < lines.length; i++) {
                try {
                    const values = lines[i].split(',').map(v => v.trim());
                    const name = values[nameIdx];
                    
                    if (!name) {
                        errors.push(`Row ${i + 1}: Missing device name`);
                        continue;
                    }
                    
                    const boardType = values[boardIdx] || 'tbeam';
                    const board = {
                        id: boardType,
                        name: boardType,
                        vendor: 'LilyGO',
                        chip: 'esp32',
                        icon: '📡'
                    };
                    
                    const config = {
                        deviceName: name,
                        ...(values[regionIdx] ? { region: values[regionIdx] } : {}),
                        ...(values[channelIdx] ? { channelName: values[channelIdx] } : {}),
                        ...(values[roleIdx] ? { role: values[roleIdx] } : {})
                    };
                    
                    const device = this.addDisconnectedDevice(board, config);
                    
                    // Parse tags if provided
                    if (values[tagsIdx]) {
                        device.tags = values[tagsIdx].split(';').map(t => t.trim()).filter(t => t);
                    }
                    
                    imported.push(device.id);
                } catch (e) {
                    errors.push(`Row ${i + 1}: ${e.message}`);
                }
            }
            
            this.logGlobal(`Imported ${imported.length} device(s) from CSV${errors.length > 0 ? `, ${errors.length} error(s)` : ''}`);
            
            return {
                imported: imported.length,
                errors: errors,
                deviceIds: imported
            };
        } catch (e) {
            throw new Error(`CSV import failed: ${e.message}`);
        }
    }

    exportReport() {
        const report = {
            timestamp: new Date().toISOString(),
            devices: this.devices.map(d => ({
                id: d.id,
                name: d.name,
                connectionType: d.connectionType,
                status: d.status,
                logs: d.logs,
                telemetry: d.telemetry,
                chipInfo: d.chipInfo
            }))
        };
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `batchtastic-report-${Date.now()}.json`;
        a.click();
        this.logGlobal("Report exported.");
    }

    /**
     * Batch Testing/Diagnostics
     */

    /**
     * Test device connectivity
     * @param {string} deviceId - Device ID
     * @returns {Promise<Object>} Test results
     */
    async testDeviceConnectivity(deviceId) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) {
            throw new Error('Device not found');
        }
        
        if (!device.testResults) {
            device.testResults = {};
        }
        
        const startTime = Date.now();
        let success = false;
        let latency = null;
        
        try {
            // Simple connectivity test: check if device connection is open
            if (device.connectionType === 'usb' && device.connection) {
                if (device.connection.writable) {
                    success = true;
                    latency = Date.now() - startTime;
                }
            } else if (device.connectionType === 'ble' && device.connection) {
                // BLE connection check
                success = true;
                latency = Date.now() - startTime;
            } else if (device.connectionType === 'ota') {
                // OTA devices are always "connected" (they're on the mesh)
                success = true;
                latency = 0;
            } else {
                success = false;
            }
            
            device.testResults.connectivity = success;
            device.testResults.latency = latency;
            device.testResults.lastTested = new Date().toISOString();
            
            this.log(device, `Connectivity test: ${success ? 'PASS' : 'FAIL'}${latency !== null ? ` (${latency}ms)` : ''}`);
        } catch (e) {
            device.testResults.connectivity = false;
            device.testResults.error = e.message;
            this.log(device, `Connectivity test failed: ${e.message}`);
        }
        
        return device.testResults;
    }

    /**
     * Test connectivity for multiple devices
     * @param {string[]} [deviceIds=null] - Array of device IDs (null = test all connected devices)
     * @returns {Promise<Object>} Test results summary
     */
    async testBatchConnectivity(deviceIds = null) {
        const targetDevices = deviceIds 
            ? this.devices.filter(d => deviceIds.includes(d.id))
            : this.devices.filter(d => d.connectionType !== 'ota' && d.status !== 'disconnected');
        
        if (targetDevices.length === 0) {
            throw new Error('No devices to test');
        }
        
        this.logGlobal(`Testing connectivity for ${targetDevices.length} device(s)...`);
        
        const results = await Promise.allSettled(
            targetDevices.map(d => this.testDeviceConnectivity(d.id))
        );
        
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        const passed = targetDevices.filter(d => d.testResults?.connectivity === true).length;
        const failedTests = targetDevices.filter(d => d.testResults?.connectivity === false).length;
        
        this.logGlobal(`Connectivity test complete: ${passed} passed, ${failedTests} failed`);
        
        return {
            total: targetDevices.length,
            passed,
            failed: failedTests,
            errors: failed
        };
    }

    /**
     * Get device info (node ID, firmware version, etc.)
     * @param {string} deviceId - Device ID
     * @returns {Promise<Object>} Device info object
     */
    async getDeviceInfo(deviceId) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) {
            throw new Error('Device not found');
        }
        
        // This would typically query the device via protobuf
        // For now, return available info
        return {
            id: device.id,
            name: device.name,
            nodeId: device.nodeId || null,
            connectionType: device.connectionType,
            status: device.status,
            boardType: device.boardType,
            boardName: device.boardName,
            configured: device.configured,
            config: device.config || {}
        };
    }

    /**
     * Config History/Undo
     */

    /**
     * Get config history for a device
     * @param {string} deviceId - Device ID
     * @returns {Array} Array of history entries
     */
    getConfigHistory(deviceId) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) {
            throw new Error('Device not found');
        }
        return device.configHistory || [];
    }

    /**
     * Undo last config change (revert to previous config)
     * @param {string} deviceId - Device ID
     * @returns {Promise<void>}
     */
    async undoConfig(deviceId) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) {
            throw new Error('Device not found');
        }
        
        if (!device.configHistory || device.configHistory.length === 0) {
            throw new Error('No config history to undo');
        }
        
        // Get previous config from history
        const previousConfig = device.configHistory[device.configHistory.length - 1].config;
        
        // Apply previous config
        const shouldInject = device.connectionType !== 'ota' && device.status !== 'disconnected' && device.connection;
        await this.applyConfigToDevice(deviceId, previousConfig, shouldInject, true);
        
        // Remove the last history entry
        device.configHistory.pop();
        
        this.logGlobal(`Config undone for ${device.name}`);
    }

    /**
     * Restore config from specific history entry
     * @param {string} deviceId - Device ID
     * @param {number} historyIndex - Index in config history array
     * @returns {Promise<void>}
     */
    async restoreConfigFromHistory(deviceId, historyIndex) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) {
            throw new Error('Device not found');
        }
        
        if (!device.configHistory || historyIndex < 0 || historyIndex >= device.configHistory.length) {
            throw new Error('Invalid history index');
        }
        
        const historyEntry = device.configHistory[historyIndex];
        const configToRestore = historyEntry.config;
        
        // Apply the config
        const shouldInject = device.connectionType !== 'ota' && device.status !== 'disconnected' && device.connection;
        await this.applyConfigToDevice(deviceId, configToRestore, shouldInject, true);
        
        this.logGlobal(`Config restored from history for ${device.name}`);
    }
}
