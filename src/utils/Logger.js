/**
 * Logger Utility
 * Provides simple, consistent logging across the application
 */

/**
 * Format timestamp for log entries
 * @returns {string} Formatted timestamp
 */
function formatTimestamp() {
    return new Date().toLocaleTimeString([], { hour12: false });
}

/**
 * Create a log entry with timestamp
 * @param {string} message - Log message
 * @returns {string} Formatted log entry
 */
export function createLogEntry(message) {
    return `[${formatTimestamp()}] ${message}`;
}

/**
 * Add log entry to array with size limit
 * @param {Array} logArray - Array to add log to
 * @param {string} message - Log message
 * @param {number} maxSize - Maximum size of log array (default: 100)
 */
export function addLog(logArray, message, maxSize = 100) {
    logArray.unshift(createLogEntry(message));
    if (logArray.length > maxSize) {
        logArray.pop();
    }
}

/**
 * Log to device logs
 * @param {Object} device - Device object with logs array
 * @param {string} message - Log message
 */
export function logToDevice(device, message) {
    if (device && device.logs) {
        addLog(device.logs, message);
    }
}

/**
 * Log to global logs
 * @param {Array} globalLogs - Global logs array
 * @param {string} message - Log message
 */
export function logToGlobal(globalLogs, message) {
    addLog(globalLogs, message);
}

