import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BatchManager } from '../src/BatchManager.js';

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

        it('should add OTA target device', async () => {
            const device = await manager.addDeviceOTA('!12345678');
            expect(manager.devices.length).toBe(1);
            expect(device.connectionType).toBe('ota');
            expect(device.nodeId).toBe('!12345678');
            expect(device.name).toContain('NODE-');
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
});

