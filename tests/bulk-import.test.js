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

Object.defineProperty(global, 'crypto', {
    value: {
        randomUUID: () => '12345678-1234-1234-1234-123456789abc'
    },
    writable: true,
    configurable: true
});

describe('Bulk Import', () => {
    let manager;

    beforeEach(() => {
        localStorageMock.clear();
        manager = new BatchManager();
        vi.clearAllMocks();
    });

    describe('JSON Import', () => {
        it('should import devices from JSON', () => {
            const jsonData = JSON.stringify({
                devices: [
                    {
                        name: 'Device 1',
                        boardType: 'tbeam',
                        region: 'US',
                        channelName: 'LongFast',
                        role: 'ROUTER',
                        tags: ['tag1', 'tag2']
                    },
                    {
                        name: 'Device 2',
                        boardType: 'heltec-v3',
                        region: 'EU_868',
                        channelName: 'ShortFast',
                        role: 'CLIENT'
                    }
                ]
            });
            
            const result = manager.importDevicesFromJSON(jsonData);
            
            expect(result.imported).toBe(2);
            expect(result.deviceIds.length).toBe(2);
            expect(manager.devices.length).toBe(2);
            
            const device1 = manager.devices.find(d => d.name === 'Device 1');
            expect(device1).toBeDefined();
            expect(device1.tags).toEqual(['tag1', 'tag2']);
            expect(device1.config.region).toBe('US');
        });

        it('should handle array format JSON', () => {
            const jsonData = JSON.stringify([
                {
                    name: 'Device 1',
                    boardType: 'tbeam',
                    region: 'US'
                }
            ]);
            
            const result = manager.importDevicesFromJSON(jsonData);
            
            expect(result.imported).toBe(1);
        });

        it('should handle devices with groups', () => {
            const jsonData = JSON.stringify({
                devices: [
                    {
                        name: 'Device 1',
                        boardType: 'tbeam',
                        groupId: 'test-group-id',
                        groupName: 'Test Group',
                        groupDescription: 'Test Description'
                    }
                ]
            });
            
            const result = manager.importDevicesFromJSON(jsonData);
            
            expect(result.imported).toBe(1);
            const device = manager.devices[0];
            
            // Group should be created if groupName is provided
            const groups = manager.getGroups();
            expect(groups.length).toBe(1);
            expect(groups[0].name).toBe('Test Group');
            expect(device.groupId).toBe(groups[0].id);
        });

        it('should report errors for invalid devices', () => {
            const jsonData = JSON.stringify({
                devices: [
                    {
                        name: 'Valid Device',
                        boardType: 'tbeam'
                    },
                    {
                        // Missing name
                        boardType: 'tbeam'
                    }
                ]
            });
            
            const result = manager.importDevicesFromJSON(jsonData);
            
            expect(result.imported).toBe(1);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('should throw error for invalid JSON format', () => {
            const jsonData = 'invalid json';
            
            expect(() => {
                manager.importDevicesFromJSON(jsonData);
            }).toThrow();
        });
    });

    describe('CSV Import', () => {
        it('should import devices from CSV', () => {
            const csvData = `name,boardType,region,channelName,role,tags
Device 1,tbeam,US,LongFast,ROUTER,tag1;tag2
Device 2,heltec-v3,EU_868,ShortFast,CLIENT,`;
            
            const result = manager.importDevicesFromCSV(csvData);
            
            expect(result.imported).toBe(2);
            expect(result.deviceIds.length).toBe(2);
            
            const device1 = manager.devices.find(d => d.name === 'Device 1');
            expect(device1).toBeDefined();
            expect(device1.tags).toEqual(['tag1', 'tag2']);
            expect(device1.config.region).toBe('US');
        });

        it('should handle CSV with missing optional columns', () => {
            const csvData = `name,boardType
Device 1,tbeam
Device 2,heltec-v3`;
            
            const result = manager.importDevicesFromCSV(csvData);
            
            expect(result.imported).toBe(2);
        });

        it('should throw error for CSV without name column', () => {
            const csvData = `boardType,region
tbeam,US`;
            
            expect(() => {
                manager.importDevicesFromCSV(csvData);
            }).toThrow('CSV must have a "name" or "deviceName" column');
        });

        it('should handle CSV with semicolon-separated tags', () => {
            const csvData = `name,boardType,tags
Device 1,tbeam,tag1;tag2;tag3`;
            
            const result = manager.importDevicesFromCSV(csvData);
            
            expect(result.imported).toBe(1);
            const device = manager.devices[0];
            expect(device.tags).toEqual(['tag1', 'tag2', 'tag3']);
        });

        it('should report errors for invalid rows', () => {
            const csvData = `name,boardType
Device 1,tbeam
,invalid
Device 2,heltec-v3`;
            
            const result = manager.importDevicesFromCSV(csvData);
            
            expect(result.imported).toBe(2);
            expect(result.errors.length).toBeGreaterThan(0);
        });
    });
});

