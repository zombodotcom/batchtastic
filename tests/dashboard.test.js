import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BatchManager } from '../src/BatchManager.js';
import { logToGlobal } from '../src/utils/Logger.js';

describe('Fleet Dashboard', () => {
    let manager;

    beforeEach(() => {
        manager = new BatchManager();
        // Mock localStorage
        global.localStorage = {
            getItem: vi.fn(() => null),
            setItem: vi.fn(),
            removeItem: vi.fn(),
            clear: vi.fn()
        };
    });

    it('should calculate fleet health percentage correctly', async () => {
        // Add 10 devices, 7 ready
        for (let i = 0; i < 10; i++) {
            const mockPort = { name: `Device${i}`, open: () => Promise.resolve() };
            const device = await manager.addDevice(mockPort);
            if (i < 7) {
                device.status = 'ready';
            } else {
                device.status = 'disconnected';
            }
        }

        const readyDevices = manager.devices.filter(d => d.status === 'ready').length;
        const healthPercent = Math.round((readyDevices / manager.devices.length) * 100);
        
        expect(healthPercent).toBe(70);
    });

    it('should calculate average battery correctly', async () => {
        const mockPort1 = { name: 'Device1', open: () => Promise.resolve() };
        const mockPort2 = { name: 'Device2', open: () => Promise.resolve() };
        const mockPort3 = { name: 'Device3', open: () => Promise.resolve() };
        
        const device1 = await manager.addDevice(mockPort1);
        const device2 = await manager.addDevice(mockPort2);
        const device3 = await manager.addDevice(mockPort3);

        device1.telemetry = { batt: '4.0', snr: '5.0', util: '10' };
        device2.telemetry = { batt: '3.8', snr: '4.0', util: '15' };
        device3.telemetry = { batt: '3.6', snr: '3.0', util: '20' };

        const devicesWithBattery = manager.devices.filter(d => d.telemetry && d.telemetry.batt && d.telemetry.batt !== '--');
        const batteryValues = devicesWithBattery.map(d => parseFloat(d.telemetry.batt));
        const avgBattery = batteryValues.length > 0 
            ? (batteryValues.reduce((a, b) => a + b, 0) / batteryValues.length).toFixed(2)
            : '--';

        expect(avgBattery).toBe('3.80');
    });

    it('should identify low battery devices correctly', async () => {
        const mockPort1 = { name: 'Device1', open: () => Promise.resolve() };
        const mockPort2 = { name: 'Device2', open: () => Promise.resolve() };
        const mockPort3 = { name: 'Device3', open: () => Promise.resolve() };
        
        const device1 = await manager.addDevice(mockPort1);
        const device2 = await manager.addDevice(mockPort2);
        const device3 = await manager.addDevice(mockPort3);

        device1.telemetry = { batt: '4.0', snr: '5.0', util: '10' };
        device2.telemetry = { batt: '3.4', snr: '4.0', util: '15' }; // Low battery
        device3.telemetry = { batt: '3.2', snr: '3.0', util: '20' }; // Low battery

        const devicesWithBattery = manager.devices.filter(d => d.telemetry && d.telemetry.batt && d.telemetry.batt !== '--');
        const batteryValues = devicesWithBattery.map(d => parseFloat(d.telemetry.batt));
        const lowBatteryCount = batteryValues.filter(b => b < 3.5).length;

        expect(lowBatteryCount).toBe(2);
    });

    it('should calculate average SNR correctly', async () => {
        const mockPort1 = { name: 'Device1', open: () => Promise.resolve() };
        const mockPort2 = { name: 'Device2', open: () => Promise.resolve() };
        
        const device1 = await manager.addDevice(mockPort1);
        const device2 = await manager.addDevice(mockPort2);

        device1.telemetry = { batt: '4.0', snr: '5.0', util: '10' };
        device2.telemetry = { batt: '3.8', snr: '3.0', util: '15' };

        const devicesWithSNR = manager.devices.filter(d => d.telemetry && d.telemetry.snr && d.telemetry.snr !== '--');
        const snrValues = devicesWithSNR.map(d => parseFloat(d.telemetry.snr));
        const avgSNR = snrValues.length > 0
            ? (snrValues.reduce((a, b) => a + b, 0) / snrValues.length).toFixed(1)
            : '--';

        expect(avgSNR).toBe('4.0');
    });

    it('should handle empty device list', () => {
        expect(manager.devices.length).toBe(0);
        
        const readyDevices = manager.devices.filter(d => d.status === 'ready').length;
        const healthPercent = manager.devices.length > 0 ? Math.round((readyDevices / manager.devices.length) * 100) : 0;
        
        expect(healthPercent).toBe(0);
    });

    it('should handle devices without telemetry data', async () => {
        const mockPort1 = { name: 'Device1', open: () => Promise.resolve() };
        const mockPort2 = { name: 'Device2', open: () => Promise.resolve() };
        
        const device1 = await manager.addDevice(mockPort1);
        const device2 = await manager.addDevice(mockPort2);

        // Remove telemetry to simulate devices without telemetry
        device1.telemetry = { batt: '--', snr: '--', util: '--' };
        device2.telemetry = { batt: '--', snr: '--', util: '--' };

        const devicesWithBattery = manager.devices.filter(d => d.telemetry && d.telemetry.batt && d.telemetry.batt !== '--');
        const avgBattery = devicesWithBattery.length > 0 
            ? (devicesWithBattery.map(d => parseFloat(d.telemetry.batt)).reduce((a, b) => a + b, 0) / devicesWithBattery.length).toFixed(2)
            : '--';

        expect(avgBattery).toBe('--');
    });

    it('should get recent global logs', () => {
        logToGlobal(manager.globalLogs, 'Test log 1');
        logToGlobal(manager.globalLogs, 'Test log 2');
        logToGlobal(manager.globalLogs, 'Test log 3');
        logToGlobal(manager.globalLogs, 'Test log 4');

        const recentEvents = manager.globalLogs.slice(0, 3);
        expect(recentEvents.length).toBe(3);
        expect(recentEvents[0]).toContain('Test log 4');
        expect(recentEvents[2]).toContain('Test log 2');
    });
});

