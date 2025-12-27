import { create, toBinary } from '@bufbuild/protobuf';
import * as Protobuf from '@meshtastic/protobufs';
import crc16ccitt from 'crc/calculators/crc16ccitt';
import { REGION_MAP, ROLE_MAP, MODEM_PRESET_MAP, GPS_FORMAT_MAP, UNITS_MAP, OLED_TYPE_MAP, DISPLAY_MODE_MAP, ADDRESS_MODE_MAP, BLUETOOTH_MODE_MAP, mapEnum } from './utils/EnumMapper.js';
import { copyFields, mapConfigFields } from './utils/ConfigMapper.js';

/**
 * Encode a single Config message as ToRadio binary
 * @param {Object} config - Config object with fields like region, role, modemPreset, hopLimit
 * @param {string} [config.region] - LoRa region code (e.g., 'US', 'EU_868')
 * @param {string} [config.role] - Device role (e.g., 'ROUTER', 'CLIENT')
 * @param {string} [config.modemPreset] - Modem preset (e.g., 'LONG_FAST')
 * @param {number} [config.hopLimit] - Hop limit (1-7)
 * @returns {Uint8Array} Binary protobuf ToRadio message
 * @throws {Error} If config is invalid or missing required fields
 */
export function encodeConfigToProtobuf(config) {
    if (!config || typeof config !== 'object') {
        throw new Error('Config must be an object');
    }

    // Build Config object with appropriate payloadVariant
    let configMessage;
    
    // Handle LoRa config (region, modemPreset, hopLimit)
    if (config.region || config.modemPreset || config.hopLimit !== undefined) {
        const loraConfig = {};
        
        if (config.region) {
            const regionCode = REGION_MAP[config.region];
            if (regionCode === undefined) {
                throw new Error(`Invalid region: ${config.region}`);
            }
            loraConfig.region = regionCode;
        }
        
        if (config.modemPreset) {
            const preset = MODEM_PRESET_MAP[config.modemPreset];
            if (preset === undefined) {
                throw new Error(`Invalid modemPreset: ${config.modemPreset}`);
            }
            loraConfig.modemPreset = preset;
        }
        
        if (config.hopLimit !== undefined) {
            loraConfig.hopLimit = config.hopLimit;
        }
        
        configMessage = create(Protobuf.Config.ConfigSchema, {
            payloadVariant: {
                case: "lora",
                value: create(Protobuf.Config.Config_LoRaConfigSchema, loraConfig)
            }
        });
    }
    // Handle Device config (role)
    else if (config.role) {
        const roleCode = ROLE_MAP[config.role];
        if (roleCode === undefined) {
            throw new Error(`Invalid role: ${config.role}`);
        }
        
        configMessage = create(Protobuf.Config.ConfigSchema, {
            payloadVariant: {
                case: "device",
                value: create(Protobuf.Config.Config_DeviceConfigSchema, {
                    role: roleCode
                })
            }
        });
    } else {
        throw new Error('No valid config fields provided (region, role, modemPreset, or hopLimit)');
    }
    
    // Wrap in AdminMessage
    const adminMessage = create(Protobuf.Admin.AdminMessageSchema, {
        payloadVariant: {
            case: "setConfig",
            value: configMessage
        }
    });
    
    // Wrap in MeshPacket
    const meshPacket = create(Protobuf.Mesh.MeshPacketSchema, {
        payloadVariant: {
            case: "decoded",
            value: {
                payload: toBinary(Protobuf.Admin.AdminMessageSchema, adminMessage),
                portnum: Protobuf.Portnums.PortNum.ADMIN_APP,
                wantResponse: true
            }
        }
    });
    
    // Wrap in ToRadio
    const toRadio = create(Protobuf.Mesh.ToRadioSchema, {
        payloadVariant: {
            case: "packet",
            value: meshPacket
        }
    });
    
    // Encode to binary
    return toBinary(Protobuf.Mesh.ToRadioSchema, toRadio);
}

/**
 * Encode XModem packet as ToRadio binary
 * Used for OTA firmware updates over the mesh
 * @param {Protobuf.Xmodem.XModem_Control} control - XModem control byte (SOH, STX, ACK, NAK, EOT)
 * @param {Uint8Array} buffer - Data buffer (for SOH packets, this is the 128-byte chunk)
 * @param {number} sequence - Sequence number (1-based, wraps at 256)
 * @param {number} crc16 - CRC16-CCITT checksum (calculated if not provided)
 * @returns {Uint8Array} Binary protobuf ToRadio message
 */
export function encodeXModemPacket(control, buffer = null, sequence = 0, crc16 = null) {
    // Calculate CRC16 if buffer provided and crc16 not specified
    if (buffer && crc16 === null) {
        crc16 = crc16ccitt(buffer);
    }
    
    const xmodemPacket = create(Protobuf.Xmodem.XModemSchema, {
        control: control,
        buffer: buffer,
        seq: sequence,
        crc16: crc16 || 0
    });
    
    const toRadio = create(Protobuf.Mesh.ToRadioSchema, {
        payloadVariant: {
            case: "xmodemPacket",
            value: xmodemPacket
        }
    });
    
    return toBinary(Protobuf.Mesh.ToRadioSchema, toRadio);
}

/**
 * Encode OTA start message (STX with filename)
 * Initiates OTA firmware transfer
 * @param {string} filename - Firmware filename (e.g., "firmware-tbeam-v2.0.0.bin")
 * @returns {Uint8Array} Binary protobuf ToRadio message
 */
export function encodeOTAStart(filename) {
    const textEncoder = new TextEncoder();
    const filenameBytes = textEncoder.encode(filename);
    
    return encodeXModemPacket(
        Protobuf.Xmodem.XModem_Control.STX,
        filenameBytes,
        0
    );
}

/**
 * Encode multiple config messages (for when both region and role need to be set)
 * Supports both legacy format (flat config object) and new format (structured config object)
 * @param {Object} config - Config object with multiple fields (legacy) or structured config (new)
 * @returns {Uint8Array[]} Array of binary protobuf ToRadio messages
 */
export function encodeMultipleConfigsToProtobuf(config) {
    // Check if this is a structured config object (new format)
    if (config.lora || config.device || config.display || config.network || config.bluetooth || config.position || config.power || config.modules) {
        return encodeFullConfig(config);
    }
    
    // Legacy format: flat config object
    const messages = [];
    
    // LoRa config (region, modemPreset, hopLimit, txPower)
    if (config.region || config.modemPreset || config.hopLimit !== undefined || config.txPower !== undefined) {
        // Pass raw values - encodeLoRaConfig will handle enum mapping
        const loraConfig = {};
        if (config.region !== undefined) loraConfig.region = config.region;
        if (config.modemPreset !== undefined) loraConfig.modemPreset = config.modemPreset;
        if (config.hopLimit !== undefined) loraConfig.hopLimit = config.hopLimit;
        if (config.txPower !== undefined) loraConfig.txPower = config.txPower;
        
        const msg = encodeLoRaConfig(loraConfig);
        if (msg) messages.push(msg);
    }
    
    // Device config (role)
    if (config.role) {
        const msg = encodeDeviceConfig({ role: config.role });
        if (msg) messages.push(msg);
    }
    
    return messages;
}

/**
 * Generic config encoder helper
 * @param {Object} inputConfig - Input config object
 * @param {Object} schema - Protobuf schema
 * @param {string} caseName - ConfigSchema case name
 * @param {Object} enumMappings - Enum mappings { field: enumMap }
 * @returns {Uint8Array|null} Encoded config or null if empty
 */
function encodeConfigGeneric(inputConfig, schema, caseName, enumMappings = {}) {
    const config = {};
    
    // Copy all fields, applying enum mappings where needed
    for (const [key, value] of Object.entries(inputConfig)) {
        // Allow 0 and false values (they're valid)
        if (value === undefined || value === null) continue;
        
        if (enumMappings[key]) {
            const enumValue = mapEnum(value, enumMappings[key], key);
            // mapEnum can return 0, which is valid, so check !== undefined
            if (enumValue !== undefined) {
                config[key] = enumValue;
            }
        } else {
            config[key] = value;
        }
    }
    
    if (Object.keys(config).length === 0) return null;
    
    // Handle module configs that might not have schemas - create directly
    // For module configs, schema might be undefined, so we create the config object directly
    let configValue;
    if (schema) {
        configValue = create(schema, config);
    } else {
        // Fallback: create plain object (for module configs without schemas)
        configValue = config;
    }
    
    const configMessage = create(Protobuf.Config.ConfigSchema, {
        payloadVariant: {
            case: caseName,
            value: configValue
        }
    });
    
    return wrapConfigInToRadio(configMessage);
}

/**
 * Helper function to wrap a Config message in ToRadio binary
 */
function wrapConfigInToRadio(configMessage) {
    const adminMessage = create(Protobuf.Admin.AdminMessageSchema, {
        payloadVariant: {
            case: "setConfig",
            value: configMessage
        }
    });
    
    const meshPacket = create(Protobuf.Mesh.MeshPacketSchema, {
        payloadVariant: {
            case: "decoded",
            value: {
                payload: toBinary(Protobuf.Admin.AdminMessageSchema, adminMessage),
                portnum: Protobuf.Portnums.PortNum.ADMIN_APP,
                wantResponse: true
            }
        }
    });
    
    const toRadio = create(Protobuf.Mesh.ToRadioSchema, {
        payloadVariant: {
            case: "packet",
            value: meshPacket
        }
    });
    
    return toBinary(Protobuf.Mesh.ToRadioSchema, toRadio);
}

/**
 * Encode LoRa Config
 */
export function encodeLoRaConfig(loraConfig) {
    return encodeConfigGeneric(
        loraConfig,
        Protobuf.Config.Config_LoRaConfigSchema,
        'lora',
        {
            region: REGION_MAP,
            modemPreset: MODEM_PRESET_MAP
        }
    );
}

/**
 * Encode Device Config
 */
export function encodeDeviceConfig(deviceConfig) {
    const REBROADCAST_MODE_MAP = {
        'ALL': Protobuf.Config.Config_DeviceConfig_RebroadcastMode?.ALL,
        'ALL_SKIP_DC': Protobuf.Config.Config_DeviceConfig_RebroadcastMode?.ALL_SKIP_DC,
        'LOCAL_ONLY': Protobuf.Config.Config_DeviceConfig_RebroadcastMode?.LOCAL_ONLY
    };
    
    return encodeConfigGeneric(
        deviceConfig,
        Protobuf.Config.Config_DeviceConfigSchema,
        'device',
        {
            role: ROLE_MAP,
            rebroadcastMode: REBROADCAST_MODE_MAP
        }
    );
}

/**
 * Encode Display Config
 */
export function encodeDisplayConfig(displayConfig) {
    return encodeConfigGeneric(
        displayConfig,
        Protobuf.Config.Config_DisplayConfigSchema,
        'display',
        {
            gpsFormat: GPS_FORMAT_MAP,
            units: UNITS_MAP,
            oledType: OLED_TYPE_MAP,
            displayMode: DISPLAY_MODE_MAP
        }
    );
}

/**
 * Encode Network Config
 */
export function encodeNetworkConfig(networkConfig) {
    return encodeConfigGeneric(
        networkConfig,
        Protobuf.Config.Config_NetworkConfigSchema,
        'network',
        {
            addressMode: ADDRESS_MODE_MAP
        }
    );
}

/**
 * Encode Bluetooth Config
 */
export function encodeBluetoothConfig(bluetoothConfig) {
    return encodeConfigGeneric(
        bluetoothConfig,
        Protobuf.Config.Config_BluetoothConfigSchema,
        'bluetooth',
        {
            mode: BLUETOOTH_MODE_MAP
        }
    );
}

/**
 * Encode Position Config
 */
export function encodePositionConfig(positionConfig) {
    return encodeConfigGeneric(
        positionConfig,
        Protobuf.Config.Config_PositionConfigSchema,
        'position'
    );
}

/**
 * Encode Power Config
 * @param {Object} powerConfig - Power configuration object
 * @param {boolean} [powerConfig.isPowerSaving] - Power saving enabled flag
 * @param {number} [powerConfig.onBatteryShutdownAfterSecs] - Battery shutdown timeout
 * @param {number} [powerConfig.adcMultiplierOverride] - ADC multiplier override
 * @param {number} [powerConfig.numSeconds] - Number of seconds
 * @param {number} [powerConfig.waitBluetoothSecs] - Wait for Bluetooth timeout
 * @returns {Uint8Array|null} Encoded config or null if empty
 */
export function encodePowerConfig(powerConfig) {
    return encodeConfigGeneric(
        powerConfig,
        Protobuf.Config.Config_PowerConfigSchema,
        'power'
    );
}

/**
 * Module Config Registry
 * Maps module names to their schemas and case names
 * Adding new modules is as simple as adding an entry here
 */
const MODULE_REGISTRY = {
    telemetry: {
        schema: Protobuf.Config.Config_TelemetryConfigSchema,
        caseName: 'telemetry',
        enumMappings: {}
    },
    serial: {
        schema: Protobuf.Config.Config_SerialConfigSchema,
        caseName: 'serial',
        enumMappings: {}
    },
    externalNotification: {
        schema: Protobuf.Config.Config_ExternalNotificationConfigSchema,
        caseName: 'externalNotification',
        enumMappings: {}
    },
    storeForward: {
        schema: Protobuf.Config.Config_StoreForwardConfigSchema,
        caseName: 'storeForward',
        enumMappings: {}
    },
    rangeTest: {
        schema: Protobuf.Config.Config_RangeTestConfigSchema,
        caseName: 'rangeTest',
        enumMappings: {}
    },
    cannedMessage: {
        schema: Protobuf.Config.Config_CannedMessageConfigSchema,
        caseName: 'cannedMessage',
        enumMappings: {
            allowInputSource: {
                'KEYBOARD': Protobuf.Config.Config_CannedMessageConfig_InputSourceChar?.KEYBOARD,
                'ZPSK': Protobuf.Config.Config_CannedMessageConfig_InputSourceChar?.ZPSK
            }
        }
    },
    audio: {
        schema: Protobuf.Config.Config_AudioConfigSchema,
        caseName: 'audio',
        enumMappings: {}
    },
    ambientLighting: {
        schema: Protobuf.Config.Config_AmbientLightingConfigSchema,
        caseName: 'ambientLighting',
        enumMappings: {}
    },
    detectionSensor: {
        schema: Protobuf.Config.Config_DetectionSensorConfigSchema,
        caseName: 'detectionSensor',
        enumMappings: {}
    },
    paxcounter: {
        schema: Protobuf.Config.Config_PaxcounterConfigSchema,
        caseName: 'paxcounter',
        enumMappings: {}
    },
    telemetryDisplay: {
        schema: Protobuf.Config.Config_TelemetryDisplayConfigSchema,
        caseName: 'telemetryDisplay',
        enumMappings: {}
    }
};

/**
 * Encode Module Config (Telemetry, Serial, External Notification, etc.)
 * Simplified using registry pattern - just add new modules to MODULE_REGISTRY
 */
export function encodeModuleConfig(moduleConfig) {
    // Find which module type is present
    const moduleType = Object.keys(moduleConfig).find(key => MODULE_REGISTRY[key]);
    if (!moduleType) return null;
    
    const moduleData = MODULE_REGISTRY[moduleType];
    if (!moduleData) return null;
    
    const moduleConfigData = moduleConfig[moduleType];
    if (!moduleConfigData || Object.keys(moduleConfigData).length === 0) return null;
    
    // Apply enum mappings if any
    const config = {};
    for (const [key, value] of Object.entries(moduleConfigData)) {
        if (value === undefined || value === null) continue;
        
        if (moduleData.enumMappings[key]) {
            const enumValue = mapEnum(value, moduleData.enumMappings[key], key);
            if (enumValue !== undefined) {
                config[key] = enumValue;
            }
        } else {
            config[key] = value;
        }
    }
    
    if (Object.keys(config).length === 0) return null;
    
    // Module configs: schema might not exist, so create config directly
    // The ConfigSchema will handle the case name
    const configValue = moduleData.schema ? create(moduleData.schema, config) : config;
    
    const configMessage = create(Protobuf.Config.ConfigSchema, {
        payloadVariant: {
            case: moduleData.caseName,
            value: configValue
        }
    });
    
    return wrapConfigInToRadio(configMessage);
}

/**
 * Encode full configuration object with all config types
 * Returns array of ToRadio messages (one per config type)
 */
export function encodeFullConfig(fullConfig) {
    const messages = [];
    
    // LoRa Config
    if (fullConfig.lora) {
        const msg = encodeLoRaConfig(fullConfig.lora);
        if (msg) messages.push(msg);
    }
    
    // Device Config
    if (fullConfig.device) {
        const msg = encodeDeviceConfig(fullConfig.device);
        if (msg) messages.push(msg);
    }
    
    // Display Config
    if (fullConfig.display) {
        const msg = encodeDisplayConfig(fullConfig.display);
        if (msg) messages.push(msg);
    }
    
    // Network Config
    if (fullConfig.network) {
        const msg = encodeNetworkConfig(fullConfig.network);
        if (msg) messages.push(msg);
    }
    
    // Bluetooth Config
    if (fullConfig.bluetooth) {
        const msg = encodeBluetoothConfig(fullConfig.bluetooth);
        if (msg) messages.push(msg);
    }
    
    // Position Config
    if (fullConfig.position) {
        const msg = encodePositionConfig(fullConfig.position);
        if (msg) messages.push(msg);
    }
    
    // Power Config
    if (fullConfig.power) {
        const msg = encodePowerConfig(fullConfig.power);
        if (msg) messages.push(msg);
    }
    
    // Module Configs
    if (fullConfig.modules) {
        for (const moduleConfig of fullConfig.modules) {
            const msg = encodeModuleConfig(moduleConfig);
            if (msg) messages.push(msg);
        }
    }
    
    return messages;
}

/**
 * Encode beginEditSettings AdminMessage as ToRadio binary
 * Required before sending config changes to Meshtastic devices
 * @returns {Uint8Array} Binary protobuf ToRadio message
 */
export function encodeBeginEditSettings() {
    const beginEdit = create(Protobuf.Admin.AdminMessageSchema, {
        payloadVariant: {
            case: "beginEditSettings",
            value: true
        }
    });
    
    const meshPacket = create(Protobuf.Mesh.MeshPacketSchema, {
        payloadVariant: {
            case: "decoded",
            value: {
                payload: toBinary(Protobuf.Admin.AdminMessageSchema, beginEdit),
                portnum: Protobuf.Portnums.PortNum.ADMIN_APP,
                wantResponse: true
            }
        }
    });
    
    const toRadio = create(Protobuf.Mesh.ToRadioSchema, {
        payloadVariant: {
            case: "packet",
            value: meshPacket
        }
    });
    
    return toBinary(Protobuf.Mesh.ToRadioSchema, toRadio);
}

