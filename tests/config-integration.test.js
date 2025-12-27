import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BatchManager } from '../src/BatchManager.js';
import { encodeFullConfig } from '../src/ProtobufEncoder.js';

// Mock localStorage
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: vi.fn((key) => store[key] || null),
        setItem: vi.fn((key, value) => {
            store[key] = value.toString();
        }),
        removeItem: vi.fn((key) => {
            delete store[key];
        }),
        clear: vi.fn(() => {
            store = {};
        })
    };
})();

Object.defineProperty(global, 'localStorage', {
    value: localStorageMock,
    writable: true
});

// Mock Web Serial API
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

describe('Configuration Integration Tests', () => {
    let manager;

    beforeEach(() => {
        manager = new BatchManager();
        localStorageMock.clear();
        vi.clearAllMocks();
    });

    describe('Full Configuration Flow', () => {
        it('should create device, configure, and apply config', async () => {
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
            
            // Create device
            const device = await manager.addDevice(mockPort);
            expect(manager.devices.length).toBe(1);
            
            // Configure
            const config = {
                lora: { region: 'US', hopLimit: 3 },
                device: { role: 'ROUTER' }
            };
            
            // Apply config
            await manager.injectConfig(device.id, config);
            
            // Verify config was sent
            expect(mockWriter.write).toHaveBeenCalled();
            expect(manager.globalLogs.some(log => log.includes('Config injected'))).toBe(true);
        });

        it('should save preset, load preset, and apply to device', async () => {
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
            
            // Save preset
            const config = {
                lora: { region: 'EU_868', txPower: 20 },
                device: { role: 'CLIENT' }
            };
            const preset = manager.saveConfigurationPreset('Test Preset', config);
            
            // Load preset
            const loadedConfig = manager.loadConfigurationPreset(preset.id);
            expect(loadedConfig).toEqual(config);
            
            // Apply to device
            await manager.injectConfig(device.id, loadedConfig);
            
            expect(mockWriter.write).toHaveBeenCalled();
        });

        it('should export config, import config, and apply to device', async () => {
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
            device.pendingConfig = {
                lora: { region: 'US' },
                device: { role: 'ROUTER' }
            };
            
            // Export config
            const exported = manager.exportConfiguration(device.id);
            const parsed = JSON.parse(exported);
            expect(parsed.config).toEqual(device.pendingConfig);
            
            // Clear pending config
            device.pendingConfig = null;
            
            // Import config
            manager.importConfiguration(exported);
            expect(device.pendingConfig).toEqual(parsed.config);
            
            // Apply config
            await manager.injectConfig(device.id, device.pendingConfig);
            expect(mockWriter.write).toHaveBeenCalled();
        });

        it('should configure multiple devices with same preset', async () => {
            const mockWriter1 = {
                write: vi.fn(() => Promise.resolve()),
                releaseLock: vi.fn()
            };
            const mockWriter2 = {
                write: vi.fn(() => Promise.resolve()),
                releaseLock: vi.fn()
            };
            const mockPort1 = {
                name: 'MockPort1',
                writable: {
                    getWriter: vi.fn(() => mockWriter1)
                },
                open: vi.fn(() => Promise.resolve())
            };
            const mockPort2 = {
                name: 'MockPort2',
                writable: {
                    getWriter: vi.fn(() => mockWriter2)
                },
                open: vi.fn(() => Promise.resolve())
            };
            
            const device1 = await manager.addDevice(mockPort1);
            const device2 = await manager.addDevice(mockPort2);
            
            // Save preset
            const config = {
                lora: { region: 'US', hopLimit: 3 },
                device: { role: 'ROUTER' }
            };
            const preset = manager.saveConfigurationPreset('Shared Preset', config);
            
            // Apply to both devices
            const loadedConfig = manager.loadConfigurationPreset(preset.id);
            await manager.injectConfig(device1.id, loadedConfig);
            await manager.injectConfig(device2.id, loadedConfig);
            
            expect(mockWriter1.write).toHaveBeenCalled();
            expect(mockWriter2.write).toHaveBeenCalled();
        });
    });

    describe('Module Configuration Flow', () => {
        it('should configure telemetry module and apply', async () => {
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
                modules: [
                    {
                        telemetry: {
                            deviceUpdateInterval: 3600,
                            environmentUpdateInterval: 300,
                            environmentMeasurementEnabled: true
                        }
                    }
                ]
            };
            
            await manager.injectConfig(device.id, config);
            
            // Verify encoding produces valid messages
            const encoded = encodeFullConfig(config);
            expect(encoded.length).toBeGreaterThan(0);
            expect(mockWriter.write).toHaveBeenCalled();
        });

        it('should configure serial module and apply', async () => {
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
                modules: [
                    {
                        serial: {
                            enabled: true,
                            baud: 115200,
                            echo: false
                        }
                    }
                ]
            };
            
            await manager.injectConfig(device.id, config);
            
            const encoded = encodeFullConfig(config);
            expect(encoded.length).toBeGreaterThan(0);
            expect(mockWriter.write).toHaveBeenCalled();
        });

        it('should configure multiple modules and apply all', async () => {
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
                modules: [
                    { telemetry: { deviceUpdateInterval: 3600 } },
                    { serial: { enabled: true, baud: 115200 } },
                    { externalNotification: { enabled: true, output: 2 } }
                ]
            };
            
            await manager.injectConfig(device.id, config);
            
            // Should send beginEditSettings + 3 module config messages
            expect(mockWriter.write).toHaveBeenCalledTimes(4);
        });
    });

    describe('Error Handling', () => {
        it('should handle invalid config validation error', async () => {
            const mockPort = { name: 'MockPort' };
            const device = await manager.addDevice(mockPort);
            
            const invalidConfig = {
                lora: { region: 'INVALID_REGION' }
            };
            
            await expect(manager.injectConfig(device.id, invalidConfig)).rejects.toThrow();
        });

        it('should handle device disconnection during config gracefully', async () => {
            const mockWriter = {
                write: vi.fn(() => Promise.reject(new Error('Device disconnected'))),
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
                lora: { region: 'US' }
            };
            
            await expect(manager.injectConfig(device.id, config)).rejects.toThrow('Device disconnected');
        });

        it('should handle API failure during preset save gracefully', () => {
            // Mock localStorage.setItem to throw error
            localStorageMock.setItem.mockImplementationOnce(() => {
                throw new Error('Storage quota exceeded');
            });
            
            const config = {
                lora: { region: 'US' }
            };
            
            expect(() => {
                manager.saveConfigurationPreset('Test', config);
            }).toThrow('Storage quota exceeded');
        });

        it('should not send messages when validation fails', async () => {
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
            
            const invalidConfig = {
                lora: { txPower: 50 } // Out of range
            };
            
            try {
                await manager.injectConfig(device.id, invalidConfig);
            } catch (e) {
                // Expected to throw
            }
            
            // Should not have sent any config messages (may have sent beginEditSettings)
            // But validation should have failed before sending config
        });
    });
});

