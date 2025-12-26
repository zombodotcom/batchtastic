import { create, toBinary } from '@bufbuild/protobuf';
import * as Protobuf from '@meshtastic/protobufs';
import crc16ccitt from 'crc/calculators/crc16ccitt';

/**
 * Map our region strings to Meshtastic RegionCode enum values
 */
const REGION_MAP = {
    'US': Protobuf.Config.Config_LoRaConfig_RegionCode.US,
    'EU_868': Protobuf.Config.Config_LoRaConfig_RegionCode.EU_868,
    'EU_433': Protobuf.Config.Config_LoRaConfig_RegionCode.EU_433,
    'CN': Protobuf.Config.Config_LoRaConfig_RegionCode.CN,
    'JP': Protobuf.Config.Config_LoRaConfig_RegionCode.JP,
    'ANZ': Protobuf.Config.Config_LoRaConfig_RegionCode.ANZ,
    'KR': Protobuf.Config.Config_LoRaConfig_RegionCode.KR,
    'TW': Protobuf.Config.Config_LoRaConfig_RegionCode.TW,
    'RU': Protobuf.Config.Config_LoRaConfig_RegionCode.RU,
    'IN': Protobuf.Config.Config_LoRaConfig_RegionCode.IN,
    'NZ_865': Protobuf.Config.Config_LoRaConfig_RegionCode.NZ_865,
    'TH': Protobuf.Config.Config_LoRaConfig_RegionCode.TH,
    'LORA_24': Protobuf.Config.Config_LoRaConfig_RegionCode.LORA_24,
    'UA_433': Protobuf.Config.Config_LoRaConfig_RegionCode.UA_433,
    'UA_868': Protobuf.Config.Config_LoRaConfig_RegionCode.UA_868,
    'MY_433': Protobuf.Config.Config_LoRaConfig_RegionCode.MY_433,
    'MY_919': Protobuf.Config.Config_LoRaConfig_RegionCode.MY_919,
    'SG_923': Protobuf.Config.Config_LoRaConfig_RegionCode.SG_923
};

/**
 * Map our role strings to Meshtastic Role enum values
 */
const ROLE_MAP = {
    'CLIENT': Protobuf.Config.Config_DeviceConfig_Role.CLIENT,
    'CLIENT_MUTE': Protobuf.Config.Config_DeviceConfig_Role.CLIENT_MUTE,
    'ROUTER': Protobuf.Config.Config_DeviceConfig_Role.ROUTER,
    'TRACKER': Protobuf.Config.Config_DeviceConfig_Role.TRACKER,
    'SENSOR': Protobuf.Config.Config_DeviceConfig_Role.SENSOR,
    'TAK': Protobuf.Config.Config_DeviceConfig_Role.TAK,
    'CLIENT_HIDDEN': Protobuf.Config.Config_DeviceConfig_Role.CLIENT_HIDDEN,
    'LOST_AND_FOUND': Protobuf.Config.Config_DeviceConfig_Role.LOST_AND_FOUND,
    'TAK_TRACKER': Protobuf.Config.Config_DeviceConfig_Role.TAK_TRACKER,
    'ROUTER_LATE': Protobuf.Config.Config_DeviceConfig_Role.ROUTER_LATE,
    'CLIENT_BASE': Protobuf.Config.Config_DeviceConfig_Role.CLIENT_BASE
};

/**
 * Map our modem preset strings to Meshtastic ModemPreset enum values
 */
const MODEM_PRESET_MAP = {
    'LONG_FAST': Protobuf.Config.Config_LoRaConfig_ModemPreset.LONG_FAST,
    'LONG_SLOW': Protobuf.Config.Config_LoRaConfig_ModemPreset.LONG_SLOW,
    'VERY_LONG_SLOW': Protobuf.Config.Config_LoRaConfig_ModemPreset.VERY_LONG_SLOW,
    'MEDIUM_SLOW': Protobuf.Config.Config_LoRaConfig_ModemPreset.MEDIUM_SLOW,
    'MEDIUM_FAST': Protobuf.Config.Config_LoRaConfig_ModemPreset.MEDIUM_FAST,
    'SHORT_SLOW': Protobuf.Config.Config_LoRaConfig_ModemPreset.SHORT_SLOW,
    'SHORT_FAST': Protobuf.Config.Config_LoRaConfig_ModemPreset.SHORT_FAST,
    'LONG_MODERATE': Protobuf.Config.Config_LoRaConfig_ModemPreset.LONG_MODERATE
};

/**
 * Encode a single Config message as ToRadio binary
 * @param {Object} config - Config object with fields like region, role, modemPreset, hopLimit
 * @returns {Uint8Array} Binary protobuf ToRadio message
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
 * @param {Object} config - Config object with multiple fields
 * @returns {Uint8Array[]} Array of binary protobuf ToRadio messages
 */
export function encodeMultipleConfigsToProtobuf(config) {
    const messages = [];
    
    // If both region and role are present, send separate messages
    if (config.region || config.modemPreset || config.hopLimit !== undefined) {
        const loraConfig = {};
            if (config.region) {
                const regionCode = REGION_MAP[config.region];
                if (regionCode !== undefined) {
                    loraConfig.region = regionCode;
                }
            }
        if (config.modemPreset) {
            const preset = MODEM_PRESET_MAP[config.modemPreset];
            if (preset !== undefined) {
                loraConfig.modemPreset = preset;
            }
        }
        if (config.hopLimit !== undefined) {
            loraConfig.hopLimit = config.hopLimit;
        }
        
        if (Object.keys(loraConfig).length > 0) {
            const configMessage = create(Protobuf.Config.ConfigSchema, {
                payloadVariant: {
                    case: "lora",
                    value: create(Protobuf.Config.Config_LoRaConfigSchema, loraConfig)
                }
            });
            
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
            
            messages.push(toBinary(Protobuf.Mesh.ToRadioSchema, toRadio));
        }
    }
    
    if (config.role) {
        const roleCode = ROLE_MAP[config.role];
        if (roleCode !== undefined) {
            const configMessage = create(Protobuf.Config.ConfigSchema, {
                payloadVariant: {
                    case: "device",
                    value: create(Protobuf.Config.Config_DeviceConfigSchema, {
                        role: roleCode
                    })
                }
            });
            
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
            
            messages.push(toBinary(Protobuf.Mesh.ToRadioSchema, toRadio));
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

