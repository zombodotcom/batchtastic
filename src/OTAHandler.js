import { encodeXModemPacket, encodeOTAStart } from './ProtobufEncoder.js';
import * as Protobuf from '@meshtastic/protobufs';
import crc16ccitt from 'crc/calculators/crc16ccitt';

/**
 * OTA (Over-The-Air) Firmware Update Handler
 * Uses Meshtastic XModem protocol to send firmware chunks over the mesh
 */
export class OTAHandler {
    constructor(transport, onProgress = null) {
        this.transport = transport;
        this.firmwareChunks = [];
        this.chunkSize = 128; // XModem standard chunk size
        this.sequence = 0; // Current sequence number (1-based)
        this.onProgress = onProgress; // Callback for progress updates
        this.ackReceived = false;
        this.nakReceived = false;
    }

    /**
     * Prepare firmware binary for XModem transfer
     * Splits firmware into 128-byte chunks (XModem standard)
     */
    async prepareFirmware(firmwareBinary) {
        this.firmwareChunks = [];
        this.sequence = 0;
        
        // Split into 128-byte chunks (XModem standard)
        for (let i = 0; i < firmwareBinary.length; i += this.chunkSize) {
            const chunk = firmwareBinary.slice(i, i + this.chunkSize);
            
            // Pad last chunk to 128 bytes if needed (XModem requirement)
            if (chunk.length < this.chunkSize) {
                const paddedChunk = new Uint8Array(this.chunkSize);
                paddedChunk.set(chunk);
                this.firmwareChunks.push(paddedChunk);
            } else {
                this.firmwareChunks.push(chunk);
            }
        }
        
        return this.firmwareChunks.length;
    }

    /**
     * Send OTA start message (STX with filename)
     * Initiates the OTA transfer
     */
    async startOTA(filename) {
        const startPacket = encodeOTAStart(filename);
        await this.writeToTransport(startPacket);
        return startPacket;
    }

    /**
     * Send a single XModem chunk (SOH packet)
     * @param {number} chunkIndex - Zero-based chunk index
     * @param {number} maxRetries - Maximum retry attempts (default: 3)
     * @returns {Promise<boolean>} True if chunk was acknowledged
     */
    async sendChunk(chunkIndex, maxRetries = 3) {
        if (chunkIndex >= this.firmwareChunks.length) {
            throw new Error(`Chunk index ${chunkIndex} out of range`);
        }

        const chunkData = this.firmwareChunks[chunkIndex];
        const sequence = (chunkIndex % 256) + 1; // 1-based, wraps at 256
        const crc16 = crc16ccitt(chunkData);
        
        // Reset ACK/NAK flags
        this.ackReceived = false;
        this.nakReceived = false;
        
        let retries = 0;
        while (retries < maxRetries) {
            // Send SOH packet with chunk data
            const packet = encodeXModemPacket(
                Protobuf.Xmodem.XModem_Control.SOH,
                chunkData,
                sequence,
                crc16
            );
            
            await this.writeToTransport(packet);
            
            // Wait for ACK/NAK response (with timeout)
            const responseReceived = await this.waitForResponse(2000); // 2 second timeout
            
            if (this.ackReceived) {
                this.sequence = sequence;
                if (this.onProgress) {
                    this.onProgress(chunkIndex + 1, this.firmwareChunks.length);
                }
                return true;
            } else if (this.nakReceived) {
                retries++;
                // Retry sending the same chunk
                await new Promise(resolve => setTimeout(resolve, 100));
            } else if (!responseReceived) {
                // Timeout - retry
                retries++;
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        return false; // Failed after max retries
    }

    /**
     * Send End of Transmission (EOT) packet
     */
    async sendEOT() {
        const eotPacket = encodeXModemPacket(
            Protobuf.Xmodem.XModem_Control.EOT,
            null,
            0
        );
        await this.writeToTransport(eotPacket);
        return eotPacket;
    }

    /**
     * Handle incoming XModem response packet
     * Called when device sends ACK/NAK
     */
    handleResponse(packet) {
        if (!packet || !packet.payloadVariant || packet.payloadVariant.case !== 'xmodemPacket') {
            return;
        }
        
        const xmodemPacket = packet.payloadVariant.value;
        
        switch (xmodemPacket.control) {
            case Protobuf.Xmodem.XModem_Control.ACK:
                this.ackReceived = true;
                break;
            case Protobuf.Xmodem.XModem_Control.NAK:
                this.nakReceived = true;
                break;
        }
    }

    /**
     * Wait for ACK/NAK response with timeout
     * @param {number} timeoutMs - Timeout in milliseconds
     * @returns {Promise<boolean>} True if response received
     */
    async waitForResponse(timeoutMs = 2000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeoutMs) {
            if (this.ackReceived || this.nakReceived) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        return false;
    }

    /**
     * Write data to transport (USB or BLE)
     */
    async writeToTransport(data) {
        if (!this.transport) {
            throw new Error('No transport available');
        }
        
        if (this.transport.write) {
            // BLE transport
            await this.transport.write(data);
        } else if (this.transport.writable) {
            // USB transport (Web Serial)
            const writer = this.transport.writable.getWriter();
            await writer.write(data);
            writer.releaseLock();
        } else {
            throw new Error('Transport does not support write');
        }
    }
}

