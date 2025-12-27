import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BatchManager } from '../src/BatchManager.js';

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

describe('BatchManager Configuration', () => {
    let manager;

    beforeEach(() => {
        manager = new BatchManager();
        localStorageMock.clear();
        vi.clearAllMocks();
    });

    describe('Configuration Preset System', () => {
        it('should get empty presets list initially', () => {
            const presets = manager.getConfigurationPresets();
            expect(presets).toEqual([]);
        });

        it('should save configuration preset to localStorage', () => {
            const config = {
                lora: { region: 'US', hopLimit: 3 },
                device: { role: 'ROUTER' }
            };
            const preset = manager.saveConfigurationPreset('Test Preset', config);
            
            expect(preset).toHaveProperty('id');
            expect(preset).toHaveProperty('name', 'Test Preset');
            expect(preset).toHaveProperty('config', config);
            expect(preset).toHaveProperty('createdAt');
            expect(localStorageMock.setItem).toHaveBeenCalled();
        });

        it('should load configuration preset from localStorage', () => {
            const config = {
                lora: { region: 'EU_868' },
                device: { role: 'CLIENT' }
            };
            const saved = manager.saveConfigurationPreset('Test Preset', config);
            const loaded = manager.loadConfigurationPreset(saved.id);
            
            expect(loaded).toEqual(config);
        });

        it('should throw error when loading non-existent preset', () => {
            expect(() => {
                manager.loadConfigurationPreset('non-existent-id');
            }).toThrow('Preset not found');
        });

        it('should delete configuration preset from localStorage', () => {
            const config = { lora: { region: 'US' } };
            const preset = manager.saveConfigurationPreset('Test Preset', config);
            
            expect(manager.getConfigurationPresets().length).toBe(1);
            
            manager.deleteConfigurationPreset(preset.id);
            
            expect(manager.getConfigurationPresets().length).toBe(0);
            expect(() => {
                manager.loadConfigurationPreset(preset.id);
            }).toThrow('Preset not found');
        });

        it('should get all configuration presets', () => {
            manager.saveConfigurationPreset('Preset 1', { lora: { region: 'US' } });
            manager.saveConfigurationPreset('Preset 2', { lora: { region: 'EU_868' } });
            
            const presets = manager.getConfigurationPresets();
            expect(presets.length).toBe(2);
            expect(presets[0].name).toBe('Preset 1');
            expect(presets[1].name).toBe('Preset 2');
        });

        it('should save preset with full config object', () => {
            const fullConfig = {
                lora: { region: 'US', hopLimit: 3, txPower: 20 },
                device: { role: 'ROUTER', serialEnabled: true },
                display: { screenOnSecs: 60 },
                network: { wifiEnabled: true },
                bluetooth: { enabled: true },
                position: { gpsEnabled: true },
                power: { isPowerSaving: false },
                modules: [
                    { telemetry: { deviceUpdateInterval: 3600 } }
                ]
            };
            const preset = manager.saveConfigurationPreset('Full Config', fullConfig);
            
            const loaded = manager.loadConfigurationPreset(preset.id);
            expect(loaded).toEqual(fullConfig);
        });

        it('should save preset with minimal config', () => {
            const minimalConfig = {
                lora: { region: 'US' }
            };
            const preset = manager.saveConfigurationPreset('Minimal Config', minimalConfig);
            
            const loaded = manager.loadConfigurationPreset(preset.id);
            expect(loaded).toEqual(minimalConfig);
        });
    });

    describe('Configuration Validation', () => {
        it('should validate config with valid region', () => {
            const config = {
                lora: { region: 'US' }
            };
            expect(() => manager.validateConfig(config)).not.toThrow();
        });

        it('should validate config with valid TX power range', () => {
            const config = {
                lora: { txPower: 20 }
            };
            expect(() => manager.validateConfig(config)).not.toThrow();
        });

        it('should validate config with valid hop limit range', () => {
            const config = {
                lora: { hopLimit: 5 }
            };
            expect(() => manager.validateConfig(config)).not.toThrow();
        });

        it('should validate config with valid device role', () => {
            const config = {
                device: { role: 'ROUTER' }
            };
            expect(() => manager.validateConfig(config)).not.toThrow();
        });

        it('should throw error for invalid region', () => {
            const config = {
                lora: { region: 'INVALID_REGION' }
            };
            expect(() => manager.validateConfig(config)).toThrow('Invalid LoRa region');
        });

        it('should throw error for TX power out of range', () => {
            const config = {
                lora: { txPower: 35 }
            };
            expect(() => manager.validateConfig(config)).toThrow('TX Power must be between 0 and 30 dBm');
        });

        it('should throw error for hop limit out of range', () => {
            const config = {
                lora: { hopLimit: 10 }
            };
            expect(() => manager.validateConfig(config)).toThrow('Hop Limit must be between 1 and 7');
        });

        it('should throw error for invalid device role', () => {
            const config = {
                device: { role: 'INVALID_ROLE' }
            };
            expect(() => manager.validateConfig(config)).toThrow('Invalid device role');
        });

        it('should validate config with multiple valid fields', () => {
            const config = {
                lora: { region: 'US', txPower: 20, hopLimit: 3 },
                device: { role: 'ROUTER' }
            };
            expect(() => manager.validateConfig(config)).not.toThrow();
        });
    });

    describe('Configuration Import/Export', () => {
        it('should export configuration for single device', () => {
            const mockPort = { name: 'MockPort' };
            manager.addDevice(mockPort);
            const device = manager.devices[0];
            device.pendingConfig = {
                lora: { region: 'US' },
                device: { role: 'ROUTER' }
            };
            
            const exported = manager.exportConfiguration(device.id);
            const parsed = JSON.parse(exported);
            
            expect(parsed).toHaveProperty('deviceId', device.id);
            expect(parsed).toHaveProperty('deviceName', device.name);
            expect(parsed).toHaveProperty('config', device.pendingConfig);
            expect(parsed).toHaveProperty('exportedAt');
        });

        it('should export configuration for all devices', () => {
            const mockPort1 = { name: 'MockPort1' };
            const mockPort2 = { name: 'MockPort2' };
            manager.addDevice(mockPort1);
            manager.addDevice(mockPort2);
            
            manager.devices[0].pendingConfig = { lora: { region: 'US' } };
            manager.devices[1].pendingConfig = { lora: { region: 'EU_868' } };
            
            const exported = manager.exportConfiguration();
            const parsed = JSON.parse(exported);
            
            expect(parsed).toHaveProperty('devices');
            expect(parsed.devices.length).toBe(2);
            expect(parsed).toHaveProperty('exportedAt');
        });

        it('should export valid JSON format', () => {
            const mockPort = { name: 'MockPort' };
            manager.addDevice(mockPort);
            const device = manager.devices[0];
            device.pendingConfig = { lora: { region: 'US' } };
            
            const exported = manager.exportConfiguration(device.id);
            expect(() => JSON.parse(exported)).not.toThrow();
        });

        it('should import configuration for single device', () => {
            const mockPort = { name: 'MockPort' };
            manager.addDevice(mockPort);
            const device = manager.devices[0];
            
            const configJson = JSON.stringify({
                deviceId: device.id,
                deviceName: device.name,
                config: { lora: { region: 'EU_868' } },
                exportedAt: new Date().toISOString()
            });
            
            const result = manager.importConfiguration(configJson);
            
            expect(result).toHaveProperty('deviceId', device.id);
            expect(device.pendingConfig).toEqual({ lora: { region: 'EU_868' } });
        });

        it('should import configuration for multiple devices', () => {
            const mockPort1 = { name: 'MockPort1' };
            const mockPort2 = { name: 'MockPort2' };
            manager.addDevice(mockPort1);
            manager.addDevice(mockPort2);
            
            const configJson = JSON.stringify({
                devices: [
                    {
                        deviceId: manager.devices[0].id,
                        deviceName: manager.devices[0].name,
                        config: { lora: { region: 'US' } }
                    },
                    {
                        deviceId: manager.devices[1].id,
                        deviceName: manager.devices[1].name,
                        config: { lora: { region: 'EU_868' } }
                    }
                ],
                exportedAt: new Date().toISOString()
            });
            
            const result = manager.importConfiguration(configJson);
            
            expect(result).toHaveProperty('deviceIds');
            expect(result.deviceIds.length).toBe(2);
            expect(manager.devices[0].pendingConfig).toEqual({ lora: { region: 'US' } });
            expect(manager.devices[1].pendingConfig).toEqual({ lora: { region: 'EU_868' } });
        });

        it('should throw error for invalid JSON', () => {
            expect(() => {
                manager.importConfiguration('invalid json');
            }).toThrow('Import failed');
        });

        it('should throw error for missing device', () => {
            const configJson = JSON.stringify({
                deviceId: 'non-existent-id',
                deviceName: 'Test',
                config: { lora: { region: 'US' } }
            });
            
            expect(() => {
                manager.importConfiguration(configJson);
            }).toThrow('Device not found');
        });

        it('should throw error for invalid import format', () => {
            const configJson = JSON.stringify({
                invalidFormat: true
            });
            
            expect(() => {
                manager.importConfiguration(configJson);
            }).toThrow('Invalid import format');
        });
    });

    describe('Full Config Injection', () => {
        it('should inject full config with structured format', async () => {
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
                lora: { region: 'US', hopLimit: 3 },
                device: { role: 'ROUTER' }
            };
            
            await manager.injectFullConfig(config, [device.id]);
            
            expect(mockWriter.write).toHaveBeenCalled();
        });

        it('should send multiple messages for full config', async () => {
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
                lora: { region: 'US' },
                device: { role: 'ROUTER' },
                display: { screenOnSecs: 60 }
            };
            
            await manager.injectFullConfig(config, [device.id]);
            
            // Should be called multiple times (beginEditSettings + config messages)
            expect(mockWriter.write).toHaveBeenCalledTimes(4); // beginEditSettings + 3 config messages
        });

        it('should inject config to selected devices', async () => {
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
            
            manager.selectDevice(device1.id);
            
            const config = {
                lora: { region: 'US' }
            };
            
            await manager.injectFullConfig(config);
            
            expect(mockWriter1.write).toHaveBeenCalled();
            expect(mockWriter2.write).not.toHaveBeenCalled();
        });

        it('should inject config to all devices when none selected', async () => {
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
            
            await manager.addDevice(mockPort1);
            await manager.addDevice(mockPort2);
            
            const config = {
                lora: { region: 'US' }
            };
            
            await manager.injectFullConfig(config);
            
            expect(mockWriter1.write).toHaveBeenCalled();
            expect(mockWriter2.write).toHaveBeenCalled();
        });

        it('should detect structured vs legacy format in injectConfig', async () => {
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
            
            // Structured format
            const structuredConfig = {
                lora: { region: 'US' },
                device: { role: 'ROUTER' }
            };
            
            await manager.injectConfig(device.id, structuredConfig);
            expect(mockWriter.write).toHaveBeenCalled();
            
            mockWriter.write.mockClear();
            
            // Legacy format
            const legacyConfig = {
                region: 'EU_868',
                role: 'CLIENT'
            };
            
            await manager.injectConfig(device.id, legacyConfig);
            expect(mockWriter.write).toHaveBeenCalled();
        });

        it('should send beginEditSettings before config messages', async () => {
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
                lora: { region: 'US' }
            };
            
            await manager.injectConfig(device.id, config);
            
            // First call should be beginEditSettings
            const calls = mockWriter.write.mock.calls;
            expect(calls.length).toBeGreaterThan(0);
        });
    });
});

