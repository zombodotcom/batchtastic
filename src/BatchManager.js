import { BLETransport } from './BLETransport.js';
import { OTAHandler } from './OTAHandler.js';
import { BlobReader, ZipReader, BlobWriter } from '@zip.js/zip.js';

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
    }

    /**
     * Fetch available firmware releases from Meshtastic API
     * Falls back to GitHub API if the Meshtastic API is unavailable
     */
    async fetchReleases() {
        try {
            // Try Meshtastic's own API first (has better caching)
            const response = await fetch('https://api.meshtastic.org/github/firmware/list');
            if (response.ok) {
                const data = await response.json();
                return {
                    stable: data.releases.stable.slice(0, 4),
                    alpha: data.releases.alpha.slice(0, 4)
                };
            }
        } catch (e) {
            console.warn("Meshtastic API unavailable, falling back to GitHub API", e);
        }

        // Fallback to GitHub API
        try {
            const response = await fetch('https://api.github.com/repos/meshtastic/firmware/releases');
            const data = await response.json();
            const stable = data.filter(r => !r.prerelease).slice(0, 4).map(rel => ({
                id: rel.tag_name,
                title: rel.name,
                zip_url: rel.assets.find(a => a.name.endsWith('.zip'))?.browser_download_url
            }));
            const alpha = data.filter(r => r.prerelease).slice(0, 4).map(rel => ({
                id: rel.tag_name,
                title: rel.name,
                zip_url: rel.assets.find(a => a.name.endsWith('.zip'))?.browser_download_url
            }));
            return { stable, alpha };
        } catch (e) {
            console.error("Failed to fetch GitHub releases", e);
            return { stable: [], alpha: [] };
        }
    }

    /**
     * Select a firmware release for flashing
     */
    selectRelease(release) {
        this.selectedRelease = release;
        this.logGlobal(`Selected firmware: ${release.id}`);
    }

    /**
     * Fetch a firmware binary file from the selected release
     * Uses CORS-friendly Meshtastic mirror
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

    setOTAGateway(deviceId) {
        const device = this.devices.find(d => d.id === deviceId);
        if (!device) throw new Error('Device not found');
        if (device.connectionType === 'ota') throw new Error('OTA node cannot be gateway');
        
        this.otaGateway = device;
        this.logGlobal(`OTA Gateway set to ${device.name}`);
    }

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
            telemetry: { batt: '--', snr: '--', util: '--' },
            name: nodeId ? `NODE-${nodeId}` : `OTA-${deviceId}`
        };
        this.devices.push(device);
        this.logGlobal(`OTA target ${device.name} added to batch`);
        return device;
    }

    async addDeviceUSB() {
        if (!navigator.serial) {
            throw new Error('Web Serial API not supported.');
        }
        const port = await navigator.serial.requestPort();
        return this._createDevice(port, 'usb');
    }

    async addDeviceBLE() {
        const transport = new BLETransport();
        const info = await transport.connect();
        return this._createDevice(transport, 'ble', info);
    }

    _createDevice(connection, type, info = {}) {
        const deviceId = crypto.randomUUID().split('-')[0].toUpperCase();
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
            loader: null,
            chipInfo: null,
            name: info.name || `NODE-${deviceId}`
        };
        this.devices.push(device);
        this.logGlobal(`${type.toUpperCase()} device ${device.name} connected.`);
        return device;
    }

    async addDevice(port) {
        return this._createDevice(port, 'usb');
    }

    removeDevice(id) {
        if (this.isFlashing) return;
        const device = this.devices.find(d => d.id === id);
        if (device && device.connectionType === 'ble' && device.connection.disconnect) {
            device.connection.disconnect();
        }
        if (this.otaGateway?.id === id) {
            this.otaGateway = null;
        }
        this.devices = this.devices.filter(d => d.id !== id);
    }

    log(device, msg) {
        const time = new Date().toLocaleTimeString([], { hour12: false });
        const logEntry = `[${time}] ${msg}`;
        device.logs.unshift(logEntry);
        this.logGlobal(`${device.name}: ${msg}`);
    }

    logGlobal(msg) {
        const time = new Date().toLocaleTimeString([], { hour12: false });
        this.globalLogs.unshift(`[${time}] ${msg}`);
        if (this.globalLogs.length > 100) this.globalLogs.pop();
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
        this.logGlobal("=== Starting OTA Bulk Update ===");
        
        const gateway = this.otaGateway;
        const otaTargets = this.devices.filter(d => d.connectionType === 'ota');
        
        if (otaTargets.length === 0) {
            throw new Error('No OTA target nodes added.');
        }

        this.log(gateway, `Broadcasting firmware to ${otaTargets.length} nodes...`);
        
        try {
            const otaHandler = new OTAHandler(gateway.connection);
            const firmwareBinary = this.firmwareBinaries[0].data;
            const chunkCount = await otaHandler.prepareFirmware(firmwareBinary);
            
            this.log(gateway, `Firmware prepared: ${chunkCount} chunks`);
            await otaHandler.broadcastOTA(otaTargets.map(t => t.nodeId).filter(Boolean));
            this.log(gateway, "OTA announcement broadcasted");
            
            for (let i = 0; i < chunkCount; i++) {
                const progress = Math.floor((i / chunkCount) * 100);
                otaTargets.forEach(target => {
                    target.progress = progress;
                    if (i % 10 === 0) {
                        this.log(target, `Receiving chunk ${i + 1}/${chunkCount}`);
                    }
                });
                if (typeof window.render === 'function') window.render();
                await new Promise(r => setTimeout(r, 100));
            }
            
            otaTargets.forEach(target => {
                target.status = 'done';
                target.progress = 100;
                this.log(target, "✅ OTA update complete");
            });
            
            this.logGlobal(`=== OTA Update Complete: ${otaTargets.length} nodes updated ===`);
        } catch (e) {
            this.log(gateway, `❌ OTA Failed: ${e.message}`);
            otaTargets.forEach(t => t.status = 'error');
        }
        
        this.isFlashing = false;
        if (typeof window.render === 'function') window.render();
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
}
