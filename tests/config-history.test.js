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

// Mock crypto.randomUUID
let uuidCounter = 0;
Object.defineProperty(global, 'crypto', {
    value: {
        randomUUID: () => {
            uuidCounter++;
            return `1234567${uuidCounter}-1234-1234-1234-123456789abc`;
        }
    },
    writable: true,
    configurable: true
});

describe('Config History', () => {
    let manager;

    beforeEach(() => {
        localStorageMock.clear();
        manager = new BatchManager();
        vi.clearAllMocks();
    });

    describe('Config History Tracking', () => {
        it('should save config to history when applying', async () => {
            const mockPort = { name: 'MockPort', open: vi.fn(), writable: { getWriter: vi.fn() } };
            const device = await manager.addDevice(mockPort);
            
            // Set initial config
            device.config = { region: 'US', channelName: 'Test1' };
            
            const config2 = { region: 'EU_868', channelName: 'Test2' };
            await manager.applyConfigToDevice(device.id, config2, false);
            
            expect(device.configHistory.length).toBe(1);
            expect(device.configHistory[0].config).toMatchObject({ region: 'US', channelName: 'Test1' });
        });

        it('should limit history to 10 entries', async () => {
            const mockPort = { name: 'MockPort', open: vi.fn(), writable: { getWriter: vi.fn() } };
            const device = await manager.addDevice(mockPort);
            
            // Set initial config
            device.config = { region: 'US' };
            
            // Apply 11 more configs with valid regions
            const regions = ['EU_868', 'CN', 'JP', 'KR', 'ANZ', 'NZ_865', 'TW_923', 'PH_923', 'SG_923', 'MY_923', 'TH_923'];
            for (let i = 0; i < 11; i++) {
                await manager.applyConfigToDevice(device.id, { region: regions[i] }, false);
            }
            
            expect(device.configHistory.length).toBe(10);
        });

        it('should get config history for device', async () => {
            const mockPort = { name: 'MockPort' };
            const device = await manager.addDevice(mockPort);
            
            device.configHistory = [
                { config: { region: 'US' }, timestamp: '2024-01-01', appliedBy: 'user' },
                { config: { region: 'EU_868' }, timestamp: '2024-01-02', appliedBy: 'user' }
            ];
            
            const history = manager.getConfigHistory(device.id);
            
            expect(history.length).toBe(2);
            expect(history[0].config.region).toBe('US');
            expect(history[1].config.region).toBe('EU_868');
        });

        it('should throw error when getting history for non-existent device', () => {
            expect(() => {
                manager.getConfigHistory('invalid-id');
            }).toThrow('Device not found');
        });
    });

    describe('Undo Config', () => {
        it('should undo last config change', async () => {
            const mockWriter = { write: vi.fn(), releaseLock: vi.fn() };
            const mockPort = { 
                name: 'MockPort', 
                open: vi.fn().mockResolvedValue(undefined),
                writable: { getWriter: () => mockWriter }
            };
            const device = await manager.addDevice(mockPort);
            
            // Set initial config
            device.config = { region: 'US', channelName: 'Test1' };
            
            const config2 = { region: 'EU_868', channelName: 'Test2' };
            await manager.applyConfigToDevice(device.id, config2, false);
            
            expect(device.config.region).toBe('EU_868');
            
            await manager.undoConfig(device.id);
            
            expect(device.config.region).toBe('US');
            expect(device.configHistory.length).toBe(0); // History entry removed after undo
        });

        it('should throw error when no history to undo', async () => {
            const mockPort = { name: 'MockPort', open: vi.fn() };
            const device = await manager.addDevice(mockPort);
            
            // No initial config, so no history
            await manager.applyConfigToDevice(device.id, { region: 'US' }, false);
            
            // Try to undo - should fail because no history
            await expect(manager.undoConfig(device.id)).rejects.toThrow('No config history to undo');
        });
    });

    describe('Restore Config from History', () => {
        it('should restore config from specific history entry', async () => {
            const mockWriter = { write: vi.fn(), releaseLock: vi.fn() };
            const mockPort = { 
                name: 'MockPort', 
                open: vi.fn().mockResolvedValue(undefined),
                writable: { getWriter: () => mockWriter }
            };
            const device = await manager.addDevice(mockPort);
            
            // Create history manually
            device.configHistory = [
                { config: { region: 'US' }, timestamp: '2024-01-01', appliedBy: 'user' },
                { config: { region: 'EU_868' }, timestamp: '2024-01-02', appliedBy: 'user' },
                { config: { region: 'CN' }, timestamp: '2024-01-03', appliedBy: 'user' }
            ];
            
            device.config = { region: 'JP' };
            
            await manager.restoreConfigFromHistory(device.id, 1);
            
            expect(device.config.region).toBe('EU_868');
        });

        it('should throw error for invalid history index', async () => {
            const mockPort = { name: 'MockPort' };
            const device = await manager.addDevice(mockPort);
            
            device.configHistory = [
                { config: { region: 'US' }, timestamp: '2024-01-01', appliedBy: 'user' }
            ];
            
            await expect(manager.restoreConfigFromHistory(device.id, 5)).rejects.toThrow('Invalid history index');
        });
    });
});

