/**
 * Device Helper Utilities
 * Common device operations
 */

/**
 * Find device by ID
 * @param {Array} devices - Array of devices
 * @param {string} deviceId - Device ID to find
 * @returns {Object|null} Device object or null if not found
 */
export function findDevice(devices, deviceId) {
    return devices.find(d => d.id === deviceId) || null;
}

/**
 * Find device by connection
 * @param {Array} devices - Array of devices
 * @param {*} connection - Connection object to find
 * @returns {Object|null} Device object or null if not found
 */
export function findDeviceByConnection(devices, connection) {
    return devices.find(d => d.connection === connection) || null;
}

/**
 * Get devices by status
 * @param {Array} devices - Array of devices
 * @param {string} status - Status to filter by
 * @returns {Array} Filtered devices
 */
export function getDevicesByStatus(devices, status) {
    return devices.filter(d => d.status === status);
}

/**
 * Get connected devices
 * @param {Array} devices - Array of devices
 * @returns {Array} Connected devices
 */
export function getConnectedDevices(devices) {
    return devices.filter(d => d.connection !== null && d.status !== 'disconnected');
}

/**
 * Get disconnected devices
 * @param {Array} devices - Array of devices
 * @returns {Array} Disconnected devices
 */
export function getDisconnectedDevices(devices) {
    return devices.filter(d => d.status === 'disconnected' || d.connection === null);
}

/**
 * Check if device exists
 * @param {Array} devices - Array of devices
 * @param {string} deviceId - Device ID to check
 * @returns {boolean} True if device exists
 */
export function deviceExists(devices, deviceId) {
    return devices.some(d => d.id === deviceId);
}

