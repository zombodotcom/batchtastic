/**
 * Meshtastic BLE Service UUIDs
 * https://meshtastic.org/docs/developers/device/ble-api
 */
export const MESHTASTIC_SERVICE_UUID = '6ba1b218-15a8-461f-9fa8-5dcae273eafd';
export const TORADIO_UUID = 'f75c76d2-129e-4dad-a1dd-7866124401e7';
export const FROMRADIO_UUID = '2c55e69e-4993-11ed-b878-0242ac120002';
export const FROMNUM_UUID = 'ed9da18c-a800-4f66-a670-aa7547e34453';

export class BLETransport {
    constructor() {
        this.device = null;
        this.server = null;
        this.service = null;
        this.toRadio = null;
        this.fromRadio = null;
        this.fromNum = null;
        this.connected = false;
    }

    async connect() {
        if (!navigator.bluetooth) {
            throw new Error('Web Bluetooth API not supported in this browser.');
        }

        this.device = await navigator.bluetooth.requestDevice({
            filters: [{ services: [MESHTASTIC_SERVICE_UUID] }],
            optionalServices: [MESHTASTIC_SERVICE_UUID]
        });

        this.device.addEventListener('gattserverdisconnected', () => {
            this.connected = false;
            console.log('BLE Device disconnected');
        });

        this.server = await this.device.gatt.connect();
        this.service = await this.server.getPrimaryService(MESHTASTIC_SERVICE_UUID);
        
        this.toRadio = await this.service.getCharacteristic(TORADIO_UUID);
        this.fromRadio = await this.service.getCharacteristic(FROMRADIO_UUID);
        this.fromNum = await this.service.getCharacteristic(FROMNUM_UUID);

        this.connected = true;

        return {
            name: this.device.name || 'Meshtastic BLE',
            id: this.device.id
        };
    }

    async disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this.connected = false;
    }

    async write(data) {
        if (!this.toRadio) throw new Error('Not connected');
        await this.toRadio.writeValue(data);
    }

    async read() {
        if (!this.fromRadio) throw new Error('Not connected');
        const value = await this.fromRadio.readValue();
        return new Uint8Array(value.buffer);
    }

    async startNotifications(callback) {
        if (!this.fromNum) throw new Error('Not connected');
        await this.fromNum.startNotifications();
        this.fromNum.addEventListener('characteristicvaluechanged', (event) => {
            callback(new Uint8Array(event.target.value.buffer));
        });
    }
}

