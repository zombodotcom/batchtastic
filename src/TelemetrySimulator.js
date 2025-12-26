/**
 * Telemetry Simulator
 * Simulates telemetry updates for testing/demo purposes
 * In production, this would be replaced with real Meshtastic protobuf packet parsing
 */

/**
 * Simulate telemetry update for a device
 * @param {Object} device - Device object
 * @returns {Object} Simulated telemetry data
 */
export function simulateTelemetry(device) {
    // Simulate realistic telemetry values
    const baseSNR = 8 + Math.sin(Date.now() / 10000) * 3; // Oscillating SNR
    const baseUtil = 20 + Math.random() * 15; // Random air utilization
    
    return {
        batteryVoltage: 3.5 + Math.random() * 0.7, // 3.5V - 4.2V
        snr: baseSNR + (Math.random() - 0.5) * 2, // Add noise
        airUtilTx: Math.min(100, baseUtil + Math.random() * 5)
    };
}

/**
 * Start periodic telemetry updates for all devices
 * @param {BatchManager} manager - BatchManager instance
 * @param {number} intervalMs - Update interval in milliseconds (default: 2000ms)
 * @returns {number} Interval ID (for clearing)
 */
export function startTelemetryUpdates(manager, intervalMs = 2000) {
    return setInterval(() => {
        manager.devices.forEach(device => {
            if (device.connectionType !== 'ota' && device.status !== 'error') {
                const telemetry = simulateTelemetry(device);
                manager.updateTelemetry(device.id, telemetry);
            }
        });
        
        // Trigger render if available
        if (typeof window.render === 'function') {
            window.render();
        }
    }, intervalMs);
}

