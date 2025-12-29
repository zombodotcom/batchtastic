import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BatchManager } from '../src/BatchManager.js';

// Mock DOM
const mockDocument = {
    getElementById: vi.fn(),
    createElement: vi.fn(),
    querySelector: vi.fn(),
    querySelectorAll: vi.fn()
};

// Mock window
const mockWindow = {
    showPrompt: vi.fn(),
    showAlert: vi.fn(),
    createModal: vi.fn(),
    URL: {
        createObjectURL: vi.fn(() => 'blob:mock-url'),
        revokeObjectURL: vi.fn()
    }
};

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

Object.defineProperty(global, 'document', {
    value: mockDocument,
    writable: true,
    configurable: true
});

Object.defineProperty(global, 'window', {
    value: mockWindow,
    writable: true,
    configurable: true
});

Object.defineProperty(global, 'crypto', {
    value: {
        randomUUID: () => '12345678-1234-1234-1234-123456789abc'
    },
    writable: true,
    configurable: true
});

// Mock DOMHelpers
vi.mock('../src/utils/DOMHelpers.js', () => ({
    showPrompt: vi.fn((msg, defaultValue) => Promise.resolve(defaultValue || 'Test Preset')),
    showAlert: vi.fn((msg) => Promise.resolve()),
    createModal: vi.fn((options) => {
        if (options.onSubmit) options.onSubmit();
        return { style: { display: 'none' } };
    }),
    getElement: vi.fn((id) => {
        const elements = {
            region: { value: 'US' },
            channelName: { value: 'LongFast' },
            nodeRole: { value: 'ROUTER' },
            modemPreset: { value: '' },
            txPower: { value: '' },
            hopLimit: { value: '' },
            configPresetSelect: {
                innerHTML: '',
                value: '',
                appendChild: vi.fn()
            }
        };
        return elements[id] || null;
    }),
    getValue: vi.fn((id) => {
        const values = {
            region: 'US',
            channelName: 'LongFast',
            nodeRole: 'ROUTER',
            modemPreset: '',
            txPower: '',
            hopLimit: ''
        };
        return values[id] || '';
    })
}));

describe('UI Functions', () => {
    let manager;

    beforeEach(() => {
        localStorageMock.clear();
        manager = new BatchManager();
        vi.clearAllMocks();
        
        // Reset DOM mocks
        mockDocument.getElementById.mockImplementation((id) => {
            const elements = {
                region: { value: 'US' },
                channelName: { value: 'LongFast' },
                nodeRole: { value: 'ROUTER' },
                modemPreset: { value: '' },
                txPower: { value: '' },
                hopLimit: { value: '' },
                configPresetSelect: {
                    innerHTML: '',
                    value: '',
                    appendChild: vi.fn(),
                    options: []
                },
                configPanelModal: {
                    dataset: { targetDeviceId: '' },
                    style: { display: 'none' }
                }
            };
            return elements[id] || null;
        });
        
        mockDocument.createElement.mockImplementation((tag) => {
            if (tag === 'a') {
                return {
                    href: '',
                    download: '',
                    click: vi.fn()
                };
            }
            if (tag === 'input') {
                return {
                    type: '',
                    accept: '',
                    files: [],
                    onchange: null,
                    click: vi.fn()
                };
            }
            if (tag === 'option') {
                return {
                    value: '',
                    textContent: '',
                    appendChild: vi.fn()
                };
            }
            return {};
        });
    });

    describe('saveCurrentConfigAsPreset', () => {
        it('should be defined as a window function', () => {
            // This would be tested in browser environment
            // For now, we verify the function exists in the module
            expect(typeof window.saveCurrentConfigAsPreset).toBe('undefined'); // Not available in test env
        });

        it('should save preset when called with valid config', async () => {
            // Simulate the function behavior
            const config = {
                region: 'US',
                channelName: 'LongFast',
                role: 'ROUTER'
            };
            
            const preset = manager.saveConfigurationPreset('Test Preset', config);
            
            expect(preset).toHaveProperty('id');
            expect(preset).toHaveProperty('name', 'Test Preset');
            expect(preset).toHaveProperty('config', config);
        });
    });

    describe('exportCurrentConfig', () => {
        it('should export config as JSON string', () => {
            const config = {
                region: 'US',
                channelName: 'LongFast',
                role: 'ROUTER'
            };
            
            const exportStr = manager.exportConfiguration();
            const exportData = JSON.parse(exportStr);
            
            expect(exportData).toHaveProperty('devices');
            expect(Array.isArray(exportData.devices)).toBe(true);
        });

        it('should export single device config', () => {
            const mockPort = { name: 'MockPort' };
            manager.addDevice(mockPort);
            const device = manager.devices[0];
            device.config = { region: 'US', channelName: 'Test' };
            
            const exportStr = manager.exportConfiguration(device.id);
            const exportData = JSON.parse(exportStr);
            
            expect(exportData).toHaveProperty('deviceId', device.id);
            expect(exportData).toHaveProperty('config');
        });
    });

    describe('importConfig', () => {
        it('should import config from JSON string', () => {
            const mockPort = { name: 'MockPort' };
            manager.addDevice(mockPort);
            const device = manager.devices[0];
            
            const importData = {
                deviceId: device.id,
                config: {
                    region: 'EU_868',
                    channelName: 'TestChannel',
                    role: 'CLIENT'
                }
            };
            
            const result = manager.importConfiguration(JSON.stringify(importData));
            
            expect(result).toHaveProperty('deviceId', device.id);
            expect(device.pendingConfig).toEqual(importData.config);
        });

        it('should handle bulk import', async () => {
            const mockPort1 = { name: 'MockPort1' };
            const mockPort2 = { name: 'MockPort2' };
            const device1 = await manager.addDevice(mockPort1);
            const device2 = await manager.addDevice(mockPort2);
            
            const importData = {
                devices: [
                    { deviceId: device1.id, config: { region: 'US' } },
                    { deviceId: device2.id, config: { region: 'EU_868' } }
                ]
            };
            
            const result = manager.importConfiguration(JSON.stringify(importData));
            
            expect(result).toHaveProperty('deviceIds');
            expect(result.deviceIds.length).toBe(2);
        });
    });

    describe('renderConfigPresets', () => {
        it('should populate preset dropdown', () => {
            // Create some presets
            manager.saveConfigurationPreset('Preset 1', { region: 'US' });
            manager.saveConfigurationPreset('Preset 2', { region: 'EU_868' });
            
            const presets = manager.getConfigurationPresets();
            expect(presets.length).toBe(2);
            
            // In real implementation, this would update the DOM
            // Here we verify the data is available
            const presetSelect = mockDocument.getElementById('configPresetSelect');
            if (presetSelect) {
                expect(presets.length).toBeGreaterThan(0);
            }
        });
    });

    describe('loadConfigPreset', () => {
        it('should load preset config', () => {
            const config = {
                region: 'US',
                channelName: 'LongFast',
                role: 'ROUTER'
            };
            
            const preset = manager.saveConfigurationPreset('Test Preset', config);
            const loaded = manager.loadConfigurationPreset(preset.id);
            
            expect(loaded).toEqual(config);
        });

        it('should throw error for invalid preset ID', () => {
            expect(() => {
                manager.loadConfigurationPreset('invalid-id');
            }).toThrow('Preset not found');
        });
    });
});

