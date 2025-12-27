import * as Protobuf from '@meshtastic/protobufs';

/**
 * Auto-generate enum map from protobuf enum object
 * Converts enum object like { US: 0, EU_868: 1 } to map { 'US': 0, 'EU_868': 1 }
 * @param {Object} enumObject - Protobuf enum object
 * @returns {Object} Map of string keys to enum values
 */
export function createEnumMap(enumObject) {
    if (!enumObject || typeof enumObject !== 'object') {
        return {};
    }
    
    const map = {};
    // Protobuf enums have both string keys and numeric values
    // We want to map string keys to their numeric values
    for (const key in enumObject) {
        if (isNaN(Number(key))) { // Skip numeric keys, keep string keys
            const value = enumObject[key];
            if (typeof value === 'number') {
                map[key] = value;
            }
        }
    }
    return map;
}

/**
 * Safely map a string value to an enum value
 * @param {string} value - String value to map
 * @param {Object} enumMap - Enum map object
 * @param {string} enumName - Name of enum for error messages
 * @returns {number|undefined} Enum value or undefined if not found
 */
export function mapEnum(value, enumMap, enumName = 'enum') {
    if (!value || !enumMap) return undefined;
    const mapped = enumMap[value];
    if (mapped === undefined) {
        console.warn(`Unknown ${enumName} value: ${value}`);
    }
    return mapped;
}

/**
 * Pre-generated enum maps for common Meshtastic enums
 * These are auto-generated from protobuf definitions
 */
export const REGION_MAP = createEnumMap(Protobuf.Config.Config_LoRaConfig_RegionCode);
export const ROLE_MAP = createEnumMap(Protobuf.Config.Config_DeviceConfig_Role);
export const MODEM_PRESET_MAP = createEnumMap(Protobuf.Config.Config_LoRaConfig_ModemPreset);
export const GPS_FORMAT_MAP = createEnumMap(Protobuf.Config.Config_DisplayConfig_GpsCoordinateFormat);
export const UNITS_MAP = createEnumMap(Protobuf.Config.Config_DisplayConfig_DisplayUnits);
export const OLED_TYPE_MAP = createEnumMap(Protobuf.Config.Config_DisplayConfig_OledType);
export const DISPLAY_MODE_MAP = createEnumMap(Protobuf.Config.Config_DisplayConfig_DisplayMode);
export const ADDRESS_MODE_MAP = createEnumMap(Protobuf.Config.Config_NetworkConfig_AddressMode);
export const BLUETOOTH_MODE_MAP = createEnumMap(Protobuf.Config.Config_BluetoothConfig_PairingMode);

/**
 * Get enum map by name (for dynamic access)
 * @param {string} name - Enum map name ('region', 'role', 'modemPreset', etc.)
 * @returns {Object|undefined} Enum map object or undefined if not found
 */
export function getEnumMap(name) {
    const maps = {
        'region': REGION_MAP,
        'role': ROLE_MAP,
        'modemPreset': MODEM_PRESET_MAP,
        'gpsFormat': GPS_FORMAT_MAP,
        'units': UNITS_MAP,
        'oledType': OLED_TYPE_MAP,
        'displayMode': DISPLAY_MODE_MAP,
        'addressMode': ADDRESS_MODE_MAP,
        'bluetoothMode': BLUETOOTH_MODE_MAP
    };
    return maps[name];
}

