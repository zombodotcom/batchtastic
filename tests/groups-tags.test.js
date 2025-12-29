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

describe('Device Groups and Tags', () => {
    let manager;

    beforeEach(() => {
        localStorageMock.clear();
        manager = new BatchManager();
        vi.clearAllMocks();
    });

    describe('Device Groups', () => {
        it('should create a device group', () => {
            const group = manager.createGroup('Test Group', 'Test Description');
            
            expect(group).toHaveProperty('id');
            expect(group).toHaveProperty('name', 'Test Group');
            expect(group).toHaveProperty('description', 'Test Description');
            expect(group).toHaveProperty('createdAt');
            
            const groups = manager.getGroups();
            expect(groups.length).toBe(1);
            expect(groups[0].id).toBe(group.id);
        });

        it('should throw error when creating group without name', () => {
            expect(() => {
                manager.createGroup('');
            }).toThrow('Group name is required');
        });

        it('should get group by ID', () => {
            const group = manager.createGroup('Test Group');
            const found = manager.getGroup(group.id);
            
            expect(found).toEqual(group);
        });

        it('should return undefined for non-existent group', () => {
            const found = manager.getGroup('invalid-id');
            expect(found).toBeUndefined();
        });

        it('should delete a group', () => {
            const group = manager.createGroup('Test Group');
            expect(manager.getGroups().length).toBe(1);
            
            manager.deleteGroup(group.id);
            
            expect(manager.getGroups().length).toBe(0);
            expect(manager.getGroup(group.id)).toBeUndefined();
        });

        it('should remove group from devices when deleted', async () => {
            const group = manager.createGroup('Test Group');
            const mockPort = { name: 'MockPort' };
            const device = await manager.addDevice(mockPort);
            
            manager.addDeviceToGroup(device.id, group.id);
            expect(device.groupId).toBe(group.id);
            
            manager.deleteGroup(group.id);
            
            expect(device.groupId).toBeNull();
        });

        it('should add device to group', async () => {
            const group = manager.createGroup('Test Group');
            const mockPort = { name: 'MockPort' };
            const device = await manager.addDevice(mockPort);
            
            manager.addDeviceToGroup(device.id, group.id);
            
            expect(device.groupId).toBe(group.id);
        });

        it('should throw error when adding non-existent device to group', () => {
            const group = manager.createGroup('Test Group');
            
            expect(() => {
                manager.addDeviceToGroup('invalid-id', group.id);
            }).toThrow('Device not found');
        });

        it('should throw error when adding device to non-existent group', async () => {
            const mockPort = { name: 'MockPort' };
            const device = await manager.addDevice(mockPort);
            
            expect(() => {
                manager.addDeviceToGroup(device.id, 'invalid-id');
            }).toThrow('Group not found');
        });

        it('should remove device from group', async () => {
            const group = manager.createGroup('Test Group');
            const mockPort = { name: 'MockPort' };
            const device = await manager.addDevice(mockPort);
            
            manager.addDeviceToGroup(device.id, group.id);
            expect(device.groupId).toBe(group.id);
            
            manager.removeDeviceFromGroup(device.id);
            
            expect(device.groupId).toBeNull();
        });

        it('should get devices by group', async () => {
            const group = manager.createGroup('Test Group');
            const mockPort1 = { name: 'MockPort1' };
            const mockPort2 = { name: 'MockPort2' };
            const device1 = await manager.addDevice(mockPort1);
            const device2 = await manager.addDevice(mockPort2);
            
            // Verify devices were created
            expect(manager.devices.length).toBe(2);
            expect(device1.id).not.toBe(device2.id);
            
            manager.addDeviceToGroup(device1.id, group.id);
            manager.addDeviceToGroup(device2.id, group.id);
            
            // Verify devices were added to group
            expect(manager.devices.find(d => d.id === device1.id)?.groupId).toBe(group.id);
            expect(manager.devices.find(d => d.id === device2.id)?.groupId).toBe(group.id);
            
            const groupDevices = manager.getDevicesByGroup(group.id);
            
            expect(groupDevices.length).toBe(2);
            expect(groupDevices.map(d => d.id)).toContain(device1.id);
            expect(groupDevices.map(d => d.id)).toContain(device2.id);
        });

        it('should apply config to group', async () => {
            const group = manager.createGroup('Test Group');
            const mockPort1 = { name: 'MockPort1' };
            const mockPort2 = { name: 'MockPort2' };
            const device1 = await manager.addDevice(mockPort1);
            const device2 = await manager.addDevice(mockPort2);
            
            manager.addDeviceToGroup(device1.id, group.id);
            manager.addDeviceToGroup(device2.id, group.id);
            
            const config = { region: 'US', channelName: 'Test' };
            
            await manager.applyConfigToGroup(group.id, config, false);
            
            // Refresh device references from manager after config application
            const updatedDevice1 = manager.devices.find(d => d.id === device1.id);
            const updatedDevice2 = manager.devices.find(d => d.id === device2.id);
            
            expect(updatedDevice1.config).toMatchObject(config);
            expect(updatedDevice2.config).toMatchObject(config);
        });
    });

    describe('Device Tags', () => {
        it('should add tag to device', async () => {
            const mockPort = { name: 'MockPort' };
            const device = await manager.addDevice(mockPort);
            
            manager.addTag(device.id, 'test-tag');
            
            expect(device.tags).toContain('test-tag');
        });

        it('should not add duplicate tags', async () => {
            const mockPort = { name: 'MockPort' };
            const device = await manager.addDevice(mockPort);
            
            manager.addTag(device.id, 'test-tag');
            manager.addTag(device.id, 'test-tag');
            
            expect(device.tags.length).toBe(1);
            expect(device.tags).toEqual(['test-tag']);
        });

        it('should remove tag from device', async () => {
            const mockPort = { name: 'MockPort' };
            const device = await manager.addDevice(mockPort);
            
            manager.addTag(device.id, 'test-tag');
            expect(device.tags).toContain('test-tag');
            
            manager.removeTag(device.id, 'test-tag');
            
            expect(device.tags).not.toContain('test-tag');
        });

        it('should get devices by tag', async () => {
            const mockPort1 = { name: 'MockPort1' };
            const mockPort2 = { name: 'MockPort2' };
            const device1 = await manager.addDevice(mockPort1);
            const device2 = await manager.addDevice(mockPort2);
            
            // Verify devices were created
            expect(manager.devices.length).toBe(2);
            expect(device1.id).not.toBe(device2.id);
            
            manager.addTag(device1.id, 'test-tag');
            manager.addTag(device2.id, 'test-tag');
            
            // Verify tags were added
            expect(manager.devices.find(d => d.id === device1.id)?.tags).toContain('test-tag');
            expect(manager.devices.find(d => d.id === device2.id)?.tags).toContain('test-tag');
            
            const taggedDevices = manager.getDevicesByTag('test-tag');
            
            expect(taggedDevices.length).toBe(2);
            expect(taggedDevices.map(d => d.id)).toContain(device1.id);
            expect(taggedDevices.map(d => d.id)).toContain(device2.id);
        });

        it('should get all unique tags', async () => {
            const mockPort1 = { name: 'MockPort1' };
            const mockPort2 = { name: 'MockPort2' };
            const device1 = await manager.addDevice(mockPort1);
            const device2 = await manager.addDevice(mockPort2);
            
            manager.addTag(device1.id, 'tag1');
            manager.addTag(device1.id, 'tag2');
            manager.addTag(device2.id, 'tag2');
            manager.addTag(device2.id, 'tag3');
            
            const allTags = manager.getAllTags();
            
            expect(allTags.length).toBe(3);
            expect(allTags).toContain('tag1');
            expect(allTags).toContain('tag2');
            expect(allTags).toContain('tag3');
        });
    });
});

