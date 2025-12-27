/**
 * Type definitions for Batchtastic Pro
 * @typedef {Object} Device
 * @property {string} id - Unique device identifier
 * @property {string} name - Device display name
 * @property {SerialPort|BLETransport|null} connection - Connection object (USB/BLE) or null if disconnected
 * @property {string} connectionType - Connection type: 'usb', 'ble', 'ota', or 'disconnected'
 * @property {string} status - Device status: 'ready', 'flashing', 'error', 'disconnected', etc.
 * @property {number} progress - Flash progress (0-100)
 * @property {string[]} logs - Array of log messages
 * @property {Object} board - Board information { id, name, vendor, chip }
 * @property {Object} pendingConfig - Configuration to apply when device connects
 * @property {Object} telemetry - Telemetry data { batt, snr, util }
 * @property {Array} snrHistory - SNR history array
 * @property {Array} airUtilHistory - Air utilization history array
 * @property {string} [nodeId] - Meshtastic node ID (for OTA devices)
 */

/**
 * @typedef {Object} Config
 * @property {Object} [lora] - LoRa configuration
 * @property {Object} [device] - Device configuration
 * @property {Object} [display] - Display configuration
 * @property {Object} [network] - Network configuration
 * @property {Object} [bluetooth] - Bluetooth configuration
 * @property {Object} [position] - Position configuration
 * @property {Object} [power] - Power configuration
 * @property {Array} [modules] - Module configurations array
 */

/**
 * @typedef {Object} Template
 * @property {string} id - Template ID
 * @property {string} name - Template name
 * @property {string} deviceName - Default device name
 * @property {string} region - LoRa region
 * @property {string} channelName - Channel name
 * @property {string} role - Device role
 * @property {string} [modemPreset] - Modem preset
 * @property {number} [txPower] - TX power
 * @property {number} [hopLimit] - Hop limit
 * @property {string} createdAt - Creation timestamp
 */

/**
 * @typedef {Object} Preset
 * @property {string} id - Preset ID
 * @property {string} name - Preset name
 * @property {Config} config - Configuration object
 * @property {string} createdAt - Creation timestamp
 */

/**
 * @typedef {Object} FirmwareBinary
 * @property {string} name - Binary filename
 * @property {Uint8Array} data - Binary data
 * @property {string} binaryString - Binary as string (for esptool-js)
 * @property {number} address - Flash address
 * @property {number} size - Binary size in bytes
 * @property {string} source - Source file name
 */

/**
 * @typedef {Object} Release
 * @property {string} id - Release tag/version
 * @property {string} title - Release title
 * @property {string} zip_url - ZIP file URL
 */

