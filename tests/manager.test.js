import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BatchManager } from '../src/BatchManager.js';
import { OTAHandler } from '../src/OTAHandler.js';
import { encodeXModemPacket, encodeOTAStart } from '../src/ProtobufEncoder.js';
import * as Protobuf from '@meshtastic/protobufs';

// Mock Web Serial API using Object.defineProperty (navigator is read-only)
Object.defineProperty(global, 'navigator', {
    value: {
        serial: {
            requestPort: vi.fn(() => Promise.resolve({ name: 'MockPort' }))
        }
    },
    writable: true,
    configurable: true
});

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
    value: {
        randomUUID: () => '12345678-1234-1234-1234-123456789abc'
    },
    writable: true,
    configurable: true
});

describe('BatchManager', () => {
    let manager;

    beforeEach(() => {
        manager = new BatchManager();
        vi.clearAllMocks();
    });

    describe('Initialization', () => {
        it('should initialize with defaults', () => {
            expect(manager.devices).toEqual([]);
            expect(manager.isFlashing).toBe(false);
            expect(manager.firmwareBinaries).toEqual([]);
            expect(manager.globalLogs).toEqual([]);
            expect(manager.otaGateway).toBe(null);
            expect(manager.selectedRelease).toBe(null);
            expect(manager.baudRate).toBe(115200);
        });
    });

    describe('Device Management', () => {
        it('should add a device via legacy addDevice()', async () => {
            const mockPort = { name: 'MockPort' };
            
            const device = await manager.addDevice(mockPort);
            expect(manager.devices.length).toBe(1);
            expect(device.connection).toBe(mockPort);
            expect(device.connectionType).toBe('usb');
            expect(typeof device.id).toBe('string');
            expect(device.id.length).toBeGreaterThan(0);
        });

        it('should add USB device', async () => {
            const device = await manager.addDeviceUSB();
            expect(manager.devices.length).toBe(1);
            expect(device.connectionType).toBe('usb');
        });

        it('should handle USB device connection errors gracefully', async () => {
            // Mock navigator.serial.requestPort to reject
            global.navigator.serial.requestPort = vi.fn(() => Promise.reject(new Error('User cancelled port selection')));
            
            await expect(manager.addDeviceUSB()).rejects.toThrow('User cancelled port selection');
            expect(manager.devices.length).toBe(0);
        });

        it('should add OTA target device', async () => {
            const device = await manager.addDeviceOTA('!12345678');
            expect(manager.devices.length).toBe(1);
            expect(device.connectionType).toBe('ota');
            expect(device.nodeId).toBe('!12345678');
            expect(device.name).toContain('NODE-');
        });

        it('should handle OTA device errors gracefully', async () => {
            // OTA doesn't throw errors currently, but test that it handles null nodeId
            const device = await manager.addDeviceOTA(null);
            expect(device.nodeId).toBe(null);
            expect(device.name).toContain('OTA-');
        });

        it('should remove a device by ID', async () => {
            const mockPort = { name: 'MockPort' };
            const device = await manager.addDevice(mockPort);
            manager.removeDevice(device.id);
            expect(manager.devices.length).toBe(0);
        });

        it('should not remove device while flashing', async () => {
            const mockPort = { name: 'MockPort' };
            const device = await manager.addDevice(mockPort);
            manager.isFlashing = true;
            manager.removeDevice(device.id);
            expect(manager.devices.length).toBe(1);
        });
    });

    describe('Logging', () => {
        it('should log messages for a device', () => {
            const device = { logs: [], name: 'TEST-NODE' };
            manager.log(device, 'Test message');
            expect(device.logs.length).toBe(1);
            expect(device.logs[0]).toContain('Test message');
            expect(manager.globalLogs.length).toBe(1);
        });

        it('should track global logs', () => {
            manager.logGlobal('Global test');
            expect(manager.globalLogs.length).toBe(1);
            expect(manager.globalLogs[0]).toContain('Global test');
        });

        it('should limit global logs to 100 entries', () => {
            for (let i = 0; i < 150; i++) {
                manager.logGlobal(`Log ${i}`);
            }
            expect(manager.globalLogs.length).toBe(100);
        });
    });

    describe('Firmware Release Management', () => {
        it('should select a release', () => {
            const release = { id: 'v2.7.17', title: 'Test Release', zip_url: 'https://example.com/firmware.zip' };
            manager.selectRelease(release);
            expect(manager.selectedRelease).toBe(release);
            expect(manager.globalLogs[0]).toContain('Selected firmware');
        });

        it('should fetch releases from Meshtastic API', async () => {
            global.fetch = vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        releases: {
                            stable: [{ id: 'v2.7.17', title: 'Stable Release' }],
                            alpha: [{ id: 'v2.8.0-alpha', title: 'Alpha Release' }]
                        }
                    })
                })
            );

            const releases = await manager.fetchReleases();
            expect(releases.stable.length).toBeGreaterThan(0);
            expect(releases.alpha.length).toBeGreaterThan(0);
        });

        it('should fallback to GitHub API if Meshtastic API fails', async () => {
            global.fetch = vi.fn()
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve([
                        { tag_name: 'v2.7.17', name: 'Release', prerelease: false, assets: [{ name: 'firmware.zip', browser_download_url: 'https://github.com/release.zip' }] }
                    ])
                });

            const releases = await manager.fetchReleases();
            expect(releases.stable.length).toBeGreaterThan(0);
        });
    });

    describe('Firmware File Loading', () => {
        it('should load .bin file and detect address', async () => {
            const file = new File(['test binary data'], 'firmware-tbeam-update.bin', { type: 'application/octet-stream' });
            const files = [file];
            
            await manager.loadFirmwareFiles(files);
            
            expect(manager.firmwareBinaries.length).toBe(1);
            expect(manager.firmwareBinaries[0].name).toBe('firmware-tbeam-update.bin');
            expect(manager.firmwareBinaries[0].address).toBe(0x10000); // update.bin default
            expect(manager.firmwareBinaries[0].binaryString).toBeDefined();
        });

        it('should detect factory.bin address correctly', async () => {
            const file = new File(['test'], 'firmware-tbeam.factory.bin', { type: 'application/octet-stream' });
            await manager.loadFirmwareFiles([file]);
            
            expect(manager.firmwareBinaries[0].address).toBe(0x0);
        });

        it('should detect bootloader address correctly', async () => {
            const file = new File(['test'], 'bootloader.bin', { type: 'application/octet-stream' });
            await manager.loadFirmwareFiles([file]);
            
            expect(manager.firmwareBinaries[0].address).toBe(0x1000);
        });

        it('should detect littlefs address correctly', async () => {
            const file = new File(['test'], 'littlefs-v2.7.17.bin', { type: 'application/octet-stream' });
            await manager.loadFirmwareFiles([file]);
            
            expect(manager.firmwareBinaries[0].address).toBe(0x300000);
        });

        it('should handle ZIP files with .bin extraction', async () => {
            // Create a minimal ZIP file structure (this is a simplified test)
            // In real usage, we'd need a proper ZIP file, but for now test error handling
            const file = new File(['invalid zip'], 'firmware.zip', { type: 'application/zip' });
            await manager.loadFirmwareFiles([file]);
            
            // Should log extraction attempt
            expect(manager.globalLogs.some(log => log.includes('ZIP archive') || log.includes('Extracting'))).toBe(true);
        });
    });

    describe('OTA Gateway Management', () => {
        it('should set OTA gateway', async () => {
            const mockPort = { name: 'MockPort' };
            const device = await manager.addDevice(mockPort);
            
            manager.setOTAGateway(device.id);
            expect(manager.otaGateway).toBe(device);
            expect(manager.globalLogs[0]).toContain('OTA Gateway');
        });

        it('should throw error if device not found when setting gateway', () => {
            expect(() => manager.setOTAGateway('nonexistent')).toThrow('Device not found');
        });

        it('should throw error if OTA node is set as gateway', async () => {
            const otaDevice = await manager.addDeviceOTA('!12345678');
            expect(() => manager.setOTAGateway(otaDevice.id)).toThrow('OTA node cannot be gateway');
        });
    });

    describe('Configuration Injection', () => {
        it('should inject configuration to USB device', async () => {
            const mockWriter = {
                write: vi.fn(() => Promise.resolve()),
                releaseLock: vi.fn()
            };
            const mockPort = { 
                name: 'MockPort',
                writable: {
                    getWriter: vi.fn(() => mockWriter)
                },
                open: vi.fn(() => Promise.resolve())
            };
            const device = await manager.addDevice(mockPort);
            
            const config = {
                region: 'US',
                channelName: 'LongFast',
                role: 'ROUTER'
            };
            
            await manager.injectConfig(device.id, config);
            
            expect(mockWriter.write).toHaveBeenCalled();
            expect(mockWriter.releaseLock).toHaveBeenCalled();
            expect(manager.globalLogs.some(log => log.includes('Config injected'))).toBe(true);
        });

        it('should inject configuration to BLE device', async () => {
            const mockBLE = {
                write: vi.fn(() => Promise.resolve()),
                connect: vi.fn(() => Promise.resolve({ name: 'BLE-Device' }))
            };
            
            // Mock BLETransport
            const device = await manager._createDevice(mockBLE, 'ble', { name: 'BLE-Device' });
            
            const config = {
                region: 'EU_868',
                channelName: 'MediumFast'
            };
            
            await manager.injectConfig(device.id, config);
            
            expect(mockBLE.write).toHaveBeenCalled();
        });

        it('should throw error if device not found for config injection', async () => {
            const config = { region: 'US' };
            await expect(manager.injectConfig('nonexistent', config)).rejects.toThrow('Device not found');
        });

        it('should validate config before injection', async () => {
            const mockPort = { name: 'MockPort' };
            const device = await manager.addDevice(mockPort);
            
            const invalidConfig = { invalidField: 'value' };
            
            // Should validate and reject invalid config
            await expect(manager.injectConfig(device.id, invalidConfig)).rejects.toThrow();
        });

        it('should encode config as protobuf ToRadio message', async () => {
            const config = { region: 'US', channelName: 'LongFast' };
            
            // Test that config encoding produces binary data
            const encoded = manager._encodeConfigToProtobuf(config);
            
            expect(encoded).toBeInstanceOf(Uint8Array);
            expect(encoded.length).toBeGreaterThan(0);
        });

        it('should handle protobuf encoding errors gracefully', () => {
            const invalidConfig = null;
            
            expect(() => manager._encodeConfigToProtobuf(invalidConfig)).toThrow();
        });

        it('should inject mission profile config', async () => {
            const mockWriter = {
                write: vi.fn(() => Promise.resolve()),
                releaseLock: vi.fn()
            };
            const mockPort = { 
                name: 'MockPort',
                writable: {
                    getWriter: vi.fn(() => mockWriter)
                },
                open: vi.fn(() => Promise.resolve())
            };
            const device = await manager.addDevice(mockPort);
            
            const missionProfile = {
                name: 'Community Relay',
                region: 'US',
                channelName: 'LongFast',
                role: 'ROUTER',
                modemPreset: 'LONG_FAST'
            };
            
            await manager.injectMissionProfile(device.id, missionProfile);
            
            expect(mockWriter.write).toHaveBeenCalled();
            expect(manager.globalLogs.some(log => log.includes('Mission profile'))).toBe(true);
        });
    });

    describe('Report Export', () => {
        it('should export report with device data', async () => {
            const mockPort = { name: 'MockPort' };
            await manager.addDevice(mockPort);
            
            // Mock URL.createObjectURL and document.createElement
            global.URL = {
                createObjectURL: vi.fn(() => 'blob:test'),
                revokeObjectURL: vi.fn()
            };
            
            const mockAnchor = {
                href: '',
                download: '',
                click: vi.fn()
            };
            
            // Mock document if it doesn't exist
            if (!global.document) {
                global.document = {};
            }
            global.document.createElement = vi.fn(() => mockAnchor);
            
            manager.exportReport();
            
            expect(manager.globalLogs.some(log => log.includes('Report exported'))).toBe(true);
            expect(global.document.createElement).toHaveBeenCalledWith('a');
            expect(mockAnchor.click).toHaveBeenCalled();
        });
    });

    describe('OTA (Over-The-Air) Updates', () => {
        it('should encode XModem packet correctly', () => {
            const testData = new Uint8Array(128).fill(0x42);
            const packet = encodeXModemPacket(
                Protobuf.Xmodem.XModem_Control.SOH,
                testData,
                1
            );
            
            expect(packet).toBeInstanceOf(Uint8Array);
            expect(packet.length).toBeGreaterThan(0);
        });

        it('should encode OTA start message with filename', () => {
            const filename = 'firmware-tbeam-v2.0.0.bin';
            const packet = encodeOTAStart(filename);
            
            expect(packet).toBeInstanceOf(Uint8Array);
            expect(packet.length).toBeGreaterThan(0);
        });

        it('should prepare firmware into 128-byte chunks', async () => {
            const mockTransport = {
                write: vi.fn(() => Promise.resolve())
            };
            
            const otaHandler = new OTAHandler(mockTransport);
            
            // Create test firmware (500 bytes - should create 4 chunks: 128+128+128+116 padded to 128)
            const firmware = new Uint8Array(500).fill(0xAA);
            const chunkCount = await otaHandler.prepareFirmware(firmware);
            
            expect(chunkCount).toBe(4); // 500 / 128 = 3.9, rounded up = 4
            expect(otaHandler.firmwareChunks.length).toBe(4);
            expect(otaHandler.firmwareChunks[0].length).toBe(128);
            expect(otaHandler.firmwareChunks[3].length).toBe(128); // Last chunk padded
        });

        it('should handle firmware that divides evenly into chunks', async () => {
            const mockTransport = {
                write: vi.fn(() => Promise.resolve())
            };
            
            const otaHandler = new OTAHandler(mockTransport);
            
            // 256 bytes = exactly 2 chunks
            const firmware = new Uint8Array(256).fill(0xBB);
            const chunkCount = await otaHandler.prepareFirmware(firmware);
            
            expect(chunkCount).toBe(2);
            expect(otaHandler.firmwareChunks.length).toBe(2);
            expect(otaHandler.firmwareChunks[0].length).toBe(128);
            expect(otaHandler.firmwareChunks[1].length).toBe(128);
        });

        it('should throw error if flashAllOTA called without gateway', async () => {
            await expect(manager.flashAllOTA()).rejects.toThrow('No OTA Gateway set');
        });

        it('should throw error if flashAllOTA called without firmware', async () => {
            const mockPort = { name: 'MockPort' };
            const device = await manager.addDevice(mockPort);
            manager.setOTAGateway(device.id);
            
            await expect(manager.flashAllOTA()).rejects.toThrow('No firmware selected');
        });

        it('should throw error if flashAllOTA called without OTA targets', async () => {
            const mockPort = { 
                name: 'MockPort',
                writable: {
                    getWriter: vi.fn(() => ({
                        write: vi.fn(() => Promise.resolve()),
                        releaseLock: vi.fn()
                    }))
                },
                open: vi.fn(() => Promise.resolve())
            };
            const device = await manager.addDevice(mockPort);
            manager.setOTAGateway(device.id);
            
            // Add firmware binary
            manager.firmwareBinaries = [{
                filename: 'test.bin',
                data: new Uint8Array(256)
            }];
            
            await expect(manager.flashAllOTA()).rejects.toThrow('No OTA target nodes added');
        });

        it('should handle OTA start message sending', async () => {
            const mockWriter = {
                write: vi.fn(() => Promise.resolve()),
                releaseLock: vi.fn()
            };
            const mockPort = { 
                name: 'MockPort',
                writable: {
                    getWriter: vi.fn(() => mockWriter)
                },
                open: vi.fn(() => Promise.resolve())
            };
            
            const otaHandler = new OTAHandler(mockPort);
            await otaHandler.startOTA('test-firmware.bin');
            
            expect(mockWriter.write).toHaveBeenCalled();
            expect(mockWriter.releaseLock).toHaveBeenCalled();
        });
    });
});

