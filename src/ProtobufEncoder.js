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
        if (config.txPower !== undefined) {
            loraConfig.txPower = config.txPower;
        }
        
        if (Object.keys(loraConfig).length > 0) {
            const msg = encodeLoRaConfig(loraConfig);
            if (msg) messages.push(msg);
        }
    }
    
    // Device config (role)
    if (config.role) {
        const msg = encodeDeviceConfig({ role: config.role });
        if (msg) messages.push(msg);
    }
    
    return messages;
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
    const config = {};
    
    if (loraConfig.region) {
        const regionCode = REGION_MAP[loraConfig.region];
        if (regionCode !== undefined) config.region = regionCode;
    }
    
    if (loraConfig.modemPreset) {
        const preset = MODEM_PRESET_MAP[loraConfig.modemPreset];
        if (preset !== undefined) config.modemPreset = preset;
    }
    
    if (loraConfig.hopLimit !== undefined) config.hopLimit = loraConfig.hopLimit;
    if (loraConfig.txPower !== undefined) config.txPower = loraConfig.txPower;
    if (loraConfig.txEnabled !== undefined) config.txEnabled = loraConfig.txEnabled;
    if (loraConfig.bandwidth !== undefined) config.bandwidth = loraConfig.bandwidth;
    if (loraConfig.spreadFactor !== undefined) config.spreadFactor = loraConfig.spreadFactor;
    if (loraConfig.codingRate !== undefined) config.codingRate = loraConfig.codingRate;
    if (loraConfig.frequencyOffset !== undefined) config.frequencyOffset = loraConfig.frequencyOffset;
    if (loraConfig.channelNum !== undefined) config.channelNum = loraConfig.channelNum;
    
    if (Object.keys(config).length === 0) return null;
    
    const configMessage = create(Protobuf.Config.ConfigSchema, {
        payloadVariant: {
            case: "lora",
            value: create(Protobuf.Config.Config_LoRaConfigSchema, config)
        }
    });
    
    return wrapConfigInToRadio(configMessage);
}

/**
 * Encode Device Config
 */
export function encodeDeviceConfig(deviceConfig) {
    const config = {};
    
    if (deviceConfig.role) {
        const roleCode = ROLE_MAP[deviceConfig.role];
        if (roleCode !== undefined) config.role = roleCode;
    }
    
    if (deviceConfig.serialEnabled !== undefined) config.serialEnabled = deviceConfig.serialEnabled;
    if (deviceConfig.debugLogEnabled !== undefined) config.debugLogEnabled = deviceConfig.debugLogEnabled;
    if (deviceConfig.buttonGpio !== undefined) config.buttonGpio = deviceConfig.buttonGpio;
    if (deviceConfig.buzzerGpio !== undefined) config.buzzerGpio = deviceConfig.buzzerGpio;
    if (deviceConfig.rebroadcastMode !== undefined) config.rebroadcastMode = deviceConfig.rebroadcastMode;
    if (deviceConfig.nodeInfoBroadcastSecs !== undefined) config.nodeInfoBroadcastSecs = deviceConfig.nodeInfoBroadcastSecs;
    if (deviceConfig.doubleTapAsButtonPress !== undefined) config.doubleTapAsButtonPress = deviceConfig.doubleTapAsButtonPress;
    if (deviceConfig.isManaged !== undefined) config.isManaged = deviceConfig.isManaged;
    if (deviceConfig.disableTripleClick !== undefined) config.disableTripleClick = deviceConfig.disableTripleClick;
    
    if (Object.keys(config).length === 0) return null;
    
    const configMessage = create(Protobuf.Config.ConfigSchema, {
        payloadVariant: {
            case: "device",
            value: create(Protobuf.Config.Config_DeviceConfigSchema, config)
        }
    });
    
    return wrapConfigInToRadio(configMessage);
}

/**
 * Encode Display Config
 */
export function encodeDisplayConfig(displayConfig) {
    const config = {};
    
    if (displayConfig.screenOnSecs !== undefined) config.screenOnSecs = displayConfig.screenOnSecs;
    if (displayConfig.gpsFormat !== undefined) config.gpsFormat = displayConfig.gpsFormat;
    if (displayConfig.autoScreenCarouselSecs !== undefined) config.autoScreenCarouselSecs = displayConfig.autoScreenCarouselSecs;
    if (displayConfig.compassNorthTop !== undefined) config.compassNorthTop = displayConfig.compassNorthTop;
    if (displayConfig.flipScreen !== undefined) config.flipScreen = displayConfig.flipScreen;
    if (displayConfig.units !== undefined) config.units = displayConfig.units;
    if (displayConfig.oledType !== undefined) config.oledType = displayConfig.oledType;
    if (displayConfig.displayMode !== undefined) config.displayMode = displayConfig.displayMode;
    if (displayConfig.headingBollard !== undefined) config.headingBollard = displayConfig.headingBollard;
    if (displayConfig.wakeOnTapOrMotion !== undefined) config.wakeOnTapOrMotion = displayConfig.wakeOnTapOrMotion;
    
    if (Object.keys(config).length === 0) return null;
    
    const configMessage = create(Protobuf.Config.ConfigSchema, {
        payloadVariant: {
            case: "display",
            value: create(Protobuf.Config.Config_DisplayConfigSchema, config)
        }
    });
    
    return wrapConfigInToRadio(configMessage);
}

/**
 * Encode Network Config
 */
export function encodeNetworkConfig(networkConfig) {
    const config = {};
    
    if (networkConfig.wifiEnabled !== undefined) config.wifiEnabled = networkConfig.wifiEnabled;
    if (networkConfig.wifiSsid) config.wifiSsid = networkConfig.wifiSsid;
    if (networkConfig.wifiPsk) config.wifiPsk = networkConfig.wifiPsk;
    if (networkConfig.ntpServer) config.ntpServer = networkConfig.ntpServer;
    if (networkConfig.addressMode !== undefined) config.addressMode = networkConfig.addressMode;
    if (networkConfig.ip) config.ip = networkConfig.ip;
    if (networkConfig.gateway) config.gateway = networkConfig.gateway;
    if (networkConfig.subnet) config.subnet = networkConfig.subnet;
    if (networkConfig.dnsServer) config.dnsServer = networkConfig.dnsServer;
    
    if (Object.keys(config).length === 0) return null;
    
    const configMessage = create(Protobuf.Config.ConfigSchema, {
        payloadVariant: {
            case: "network",
            value: create(Protobuf.Config.Config_NetworkConfigSchema, config)
        }
    });
    
    return wrapConfigInToRadio(configMessage);
}

/**
 * Encode Bluetooth Config
 */
export function encodeBluetoothConfig(bluetoothConfig) {
    const config = {};
    
    if (bluetoothConfig.enabled !== undefined) config.enabled = bluetoothConfig.enabled;
    if (bluetoothConfig.pairingPin !== undefined) config.pairingPin = bluetoothConfig.pairingPin;
    if (bluetoothConfig.fixedPin !== undefined) config.fixedPin = bluetoothConfig.fixedPin;
    if (bluetoothConfig.mode !== undefined) config.mode = bluetoothConfig.mode;
    
    if (Object.keys(config).length === 0) return null;
    
    const configMessage = create(Protobuf.Config.ConfigSchema, {
        payloadVariant: {
            case: "bluetooth",
            value: create(Protobuf.Config.Config_BluetoothConfigSchema, config)
        }
    });
    
    return wrapConfigInToRadio(configMessage);
}

/**
 * Encode Position Config
 */
export function encodePositionConfig(positionConfig) {
    const config = {};
    
    if (positionConfig.positionBroadcastSmartEnabled !== undefined) config.positionBroadcastSmartEnabled = positionConfig.positionBroadcastSmartEnabled;
    if (positionConfig.positionBroadcastSecs !== undefined) config.positionBroadcastSecs = positionConfig.positionBroadcastSecs;
    if (positionConfig.fixedPosition !== undefined) config.fixedPosition = positionConfig.fixedPosition;
    if (positionConfig.gpsEnabled !== undefined) config.gpsEnabled = positionConfig.gpsEnabled;
    if (positionConfig.gpsUpdateInterval !== undefined) config.gpsUpdateInterval = positionConfig.gpsUpdateInterval;
    if (positionConfig.gpsAttemptTime !== undefined) config.gpsAttemptTime = positionConfig.gpsAttemptTime;
    if (positionConfig.positionFlags !== undefined) config.positionFlags = positionConfig.positionFlags;
    
    if (Object.keys(config).length === 0) return null;
    
    const configMessage = create(Protobuf.Config.ConfigSchema, {
        payloadVariant: {
            case: "position",
            value: create(Protobuf.Config.Config_PositionConfigSchema, config)
        }
    });
    
    return wrapConfigInToRadio(configMessage);
}

/**
 * Encode Power Config
 */
export function encodePowerConfig(powerConfig) {
    const config = {};
    
    if (powerConfig.isPowerSaving !== undefined) config.isPowerSaving = powerConfig.isPowerSaving;
    if (powerConfig.onBatteryShutdownAfterSecs !== undefined) config.onBatteryShutdownAfterSecs = powerConfig.onBatteryShutdownAfterSecs;
    if (powerConfig.adcMultiplierOverride !== undefined) config.adcMultiplierOverride = powerConfig.adcMultiplierOverride;
    if (powerConfig.numSeconds !== undefined) config.numSeconds = powerConfig.numSeconds;
    if (powerConfig.waitBluetoothSecs !== undefined) config.waitBluetoothSecs = powerConfig.waitBluetoothSecs;
    
    if (Object.keys(config).length === 0) return null;
    
    const configMessage = create(Protobuf.Config.ConfigSchema, {
        payloadVariant: {
            case: "power",
            value: create(Protobuf.Config.Config_PowerConfigSchema, config)
        }
    });
    
    return wrapConfigInToRadio(configMessage);
}

/**
 * Encode Module Config (Telemetry, Serial, External Notification, etc.)
 */
export function encodeModuleConfig(moduleConfig) {
    const config = {};
    let moduleType = null;
    
    // Telemetry Module
    if (moduleConfig.telemetry) {
        moduleType = "telemetry";
        const telemetry = moduleConfig.telemetry;
        if (telemetry.deviceUpdateInterval !== undefined) config.deviceUpdateInterval = telemetry.deviceUpdateInterval;
        if (telemetry.environmentUpdateInterval !== undefined) config.environmentUpdateInterval = telemetry.environmentUpdateInterval;
        if (telemetry.environmentMeasurementEnabled !== undefined) config.environmentMeasurementEnabled = telemetry.environmentMeasurementEnabled;
        if (telemetry.environmentScreenEnabled !== undefined) config.environmentScreenEnabled = telemetry.environmentScreenEnabled;
        if (telemetry.environmentDisplayFahrenheit !== undefined) config.environmentDisplayFahrenheit = telemetry.environmentDisplayFahrenheit;
        if (telemetry.airQualityEnabled !== undefined) config.airQualityEnabled = telemetry.airQualityEnabled;
        if (telemetry.airQualityInterval !== undefined) config.airQualityInterval = telemetry.airQualityInterval;
        if (telemetry.powerMeasurementEnabled !== undefined) config.powerMeasurementEnabled = telemetry.powerMeasurementEnabled;
        if (telemetry.powerUpdateInterval !== undefined) config.powerUpdateInterval = telemetry.powerUpdateInterval;
        if (telemetry.powerScreenEnabled !== undefined) config.powerScreenEnabled = telemetry.powerScreenEnabled;
    }
    // Serial Module
    else if (moduleConfig.serial) {
        moduleType = "serial";
        const serial = moduleConfig.serial;
        if (serial.enabled !== undefined) config.enabled = serial.enabled;
        if (serial.echo !== undefined) config.echo = serial.echo;
        if (serial.rxd !== undefined) config.rxd = serial.rxd;
        if (serial.txd !== undefined) config.txd = serial.txd;
        if (serial.baud !== undefined) config.baud = serial.baud;
        if (serial.timeout !== undefined) config.timeout = serial.timeout;
        if (serial.mode !== undefined) config.mode = serial.mode;
    }
    // External Notification Module
    else if (moduleConfig.externalNotification) {
        moduleType = "externalNotification";
        const extNotif = moduleConfig.externalNotification;
        if (extNotif.enabled !== undefined) config.enabled = extNotif.enabled;
        if (extNotif.output !== undefined) config.output = extNotif.output;
        if (extNotif.outputMs !== undefined) config.outputMs = extNotif.outputMs;
        if (extNotif.outputCanBeLp !== undefined) config.outputCanBeLp = extNotif.outputCanBeLp;
        if (extNotif.ntfLed !== undefined) config.ntfLed = extNotif.ntfLed;
        if (extNotif.ntfBuzzer !== undefined) config.ntfBuzzer = extNotif.ntfBuzzer;
        if (extNotif.ntfVibrate !== undefined) config.ntfVibrate = extNotif.ntfVibrate;
        if (extNotif.active !== undefined) config.active = extNotif.active;
        if (extNotif.alertBell !== undefined) config.alertBell = extNotif.alertBell;
        if (extNotif.alertMessage !== undefined) config.alertMessage = extNotif.alertMessage;
        if (extNotif.usePwm !== undefined) config.usePwm = extNotif.usePwm;
        if (extNotif.ntfBellBuzzerAlert !== undefined) config.ntfBellBuzzerAlert = extNotif.ntfBellBuzzerAlert;
        if (extNotif.ringtone !== undefined) config.ringtone = extNotif.ringtone;
    }
    // Store & Forward Module
    else if (moduleConfig.storeForward) {
        moduleType = "storeForward";
        const sf = moduleConfig.storeForward;
        if (sf.enabled !== undefined) config.enabled = sf.enabled;
        if (sf.heartbeat !== undefined) config.heartbeat = sf.heartbeat;
        if (sf.records !== undefined) config.records = sf.records;
        if (sf.historyReturnMax !== undefined) config.historyReturnMax = sf.historyReturnMax;
        if (sf.historyReturnWindow !== undefined) config.historyReturnWindow = sf.historyReturnWindow;
    }
    // Range Test Module
    else if (moduleConfig.rangeTest) {
        moduleType = "rangeTest";
        const rt = moduleConfig.rangeTest;
        if (rt.enabled !== undefined) config.enabled = rt.enabled;
        if (rt.sender !== undefined) config.sender = rt.sender;
        if (rt.save !== undefined) config.save = rt.save;
    }
    // Canned Message Module
    else if (moduleConfig.cannedMessage) {
        moduleType = "cannedMessage";
        const cm = moduleConfig.cannedMessage;
        if (cm.enabled !== undefined) config.enabled = cm.enabled;
        if (cm.allowInputSource !== undefined) config.allowInputSource = cm.allowInputSource;
        if (cm.sendBell !== undefined) config.sendBell = cm.sendBell;
    }
    // Audio Module
    else if (moduleConfig.audio) {
        moduleType = "audio";
        const audio = moduleConfig.audio;
        if (audio.codec2Enabled !== undefined) config.codec2Enabled = audio.codec2Enabled;
        if (audio.pttPin !== undefined) config.pttPin = audio.pttPin;
        if (audio.bitrate !== undefined) config.bitrate = audio.bitrate;
        if (audio.i2sWs !== undefined) config.i2sWs = audio.i2sWs;
        if (audio.i2sSd !== undefined) config.i2sSd = audio.i2sSd;
        if (audio.i2sDin !== undefined) config.i2sDin = audio.i2sDin;
        if (audio.i2sSck !== undefined) config.i2sSck = audio.i2sSck;
        if (audio.i2sBck !== undefined) config.i2sBck = audio.i2sBck;
    }
    // Ambient Lighting Module
    else if (moduleConfig.ambientLighting) {
        moduleType = "ambientLighting";
        const al = moduleConfig.ambientLighting;
        if (al.ledState !== undefined) config.ledState = al.ledState;
        if (al.current !== undefined) config.current = al.current;
        if (al.red !== undefined) config.red = al.red;
        if (al.green !== undefined) config.green = al.green;
        if (al.blue !== undefined) config.blue = al.blue;
    }
    // Detection Sensor Module
    else if (moduleConfig.detectionSensor) {
        moduleType = "detectionSensor";
        const ds = moduleConfig.detectionSensor;
        if (ds.enabled !== undefined) config.enabled = ds.enabled;
        if (ds.minimumBroadcastSecs !== undefined) config.minimumBroadcastSecs = ds.minimumBroadcastSecs;
        if (ds.stateBroadcastEnabled !== undefined) config.stateBroadcastEnabled = ds.stateBroadcastEnabled;
    }
    // Paxcounter Module
    else if (moduleConfig.paxcounter) {
        moduleType = "paxcounter";
        const pc = moduleConfig.paxcounter;
        if (pc.enabled !== undefined) config.enabled = pc.enabled;
        if (pc.wifiEnabled !== undefined) config.wifiEnabled = pc.wifiEnabled;
        if (pc.bleEnabled !== undefined) config.bleEnabled = pc.bleEnabled;
        if (pc.updateInterval !== undefined) config.updateInterval = pc.updateInterval;
        if (pc.pincounterEnabled !== undefined) config.pincounterEnabled = pc.pincounterEnabled;
    }
    // Telemetry Display Module
    else if (moduleConfig.telemetryDisplay) {
        moduleType = "telemetryDisplay";
        const td = moduleConfig.telemetryDisplay;
        if (td.telemetryDisplayEnabled !== undefined) config.telemetryDisplayEnabled = td.telemetryDisplayEnabled;
        if (td.telemetryDisplayScreenTime !== undefined) config.telemetryDisplayScreenTime = td.telemetryDisplayScreenTime;
        if (td.telemetryDisplayOnTime !== undefined) config.telemetryDisplayOnTime = td.telemetryDisplayOnTime;
        if (td.telemetryDisplayFramesPerSecond !== undefined) config.telemetryDisplayFramesPerSecond = td.telemetryDisplayFramesPerSecond;
    }
    
    if (!moduleType || Object.keys(config).length === 0) return null;
    
    // Map module type to protobuf schema case name
    const moduleCaseMap = {
        "telemetry": "telemetry",
        "serial": "serial",
        "externalNotification": "externalNotification",
        "storeForward": "storeForward",
        "rangeTest": "rangeTest",
        "cannedMessage": "cannedMessage",
        "audio": "audio",
        "ambientLighting": "ambientLighting",
        "detectionSensor": "detectionSensor",
        "paxcounter": "paxcounter",
        "telemetryDisplay": "telemetryDisplay"
    };
    
    const caseName = moduleCaseMap[moduleType];
    if (!caseName) return null;
    
    // Get the appropriate schema
    const schemaMap = {
        "telemetry": Protobuf.Config.Config_TelemetryConfigSchema,
        "serial": Protobuf.Config.Config_SerialConfigSchema,
        "externalNotification": Protobuf.Config.Config_ExternalNotificationConfigSchema,
        "storeForward": Protobuf.Config.Config_StoreForwardConfigSchema,
        "rangeTest": Protobuf.Config.Config_RangeTestConfigSchema,
        "cannedMessage": Protobuf.Config.Config_CannedMessageConfigSchema,
        "audio": Protobuf.Config.Config_AudioConfigSchema,
        "ambientLighting": Protobuf.Config.Config_AmbientLightingConfigSchema,
        "detectionSensor": Protobuf.Config.Config_DetectionSensorConfigSchema,
        "paxcounter": Protobuf.Config.Config_PaxcounterConfigSchema,
        "telemetryDisplay": Protobuf.Config.Config_TelemetryDisplayConfigSchema
    };
    
    const schema = schemaMap[moduleType];
    if (!schema) return null;
    
    const configMessage = create(Protobuf.Config.ConfigSchema, {
        payloadVariant: {
            case: caseName,
            value: create(schema, config)
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

