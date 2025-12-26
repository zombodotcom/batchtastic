/**
 * Packet Rain Animation
 * Visualizes mesh network activity with falling packet particles
 */

export class PacketRain {
    constructor(canvas, devices = []) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.devices = devices;
        this.packets = [];
        this.animationId = null;
        this.enabled = true;
        
        // Packet types and colors
        this.packetTypes = {
            text: { color: '#2196F3', symbol: 'T' }, // Blue
            position: { color: '#4CAF50', symbol: 'P' }, // Green
            telemetry: { color: '#FF9800', symbol: 'M' }, // Orange
            routing: { color: '#9C27B0', symbol: 'R' }, // Purple
            default: { color: '#757575', symbol: '•' } // Gray
        };
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
    }

    /**
     * Update device list and spawn packets based on activity
     */
    update(devices) {
        this.devices = devices;
        
        // Spawn packets based on device activity
        // More active devices = more packets
        devices.forEach(device => {
            if (device.connectionType === 'ota') return;
            
            // Spawn packets based on air utilization
            const util = parseFloat(device.telemetry.util) || 0;
            const spawnRate = util / 100; // Higher utilization = more packets
            
            if (Math.random() < spawnRate * 0.1) { // Scale down spawn rate
                this.spawnPacket(device);
            }
        });
    }

    /**
     * Spawn a new packet particle
     */
    spawnPacket(device) {
        const packetTypes = Object.keys(this.packetTypes);
        const type = packetTypes[Math.floor(Math.random() * packetTypes.length)];
        const config = this.packetTypes[type];
        
        this.packets.push({
            x: Math.random() * this.canvas.width,
            y: -10,
            speed: 1 + Math.random() * 2,
            size: 4 + Math.random() * 4,
            type: type,
            color: config.color,
            symbol: config.symbol,
            opacity: 0.6 + Math.random() * 0.4,
            deviceId: device.id
        });
    }

    /**
     * Update packet positions
     */
    updatePackets() {
        this.packets = this.packets.filter(packet => {
            packet.y += packet.speed;
            packet.opacity *= 0.995; // Fade out
            
            // Remove packets that are off-screen or fully faded
            return packet.y < this.canvas.height + 20 && packet.opacity > 0.1;
        });
    }

    /**
     * Draw all packets
     */
    draw() {
        // Clear canvas with slight transparency for trail effect
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw packets
        this.packets.forEach(packet => {
            this.ctx.save();
            this.ctx.globalAlpha = packet.opacity;
            this.ctx.fillStyle = packet.color;
            this.ctx.strokeStyle = packet.color;
            this.ctx.lineWidth = 1;
            
            // Draw packet as small circle with symbol
            this.ctx.beginPath();
            this.ctx.arc(packet.x, packet.y, packet.size / 2, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Draw symbol
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.font = `${packet.size}px monospace`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(packet.symbol, packet.x, packet.y);
            
            this.ctx.restore();
        });
    }

    /**
     * Animation loop
     */
    animate() {
        if (!this.enabled) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            return;
        }
        
        this.updatePackets();
        this.draw();
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    /**
     * Start animation
     */
    start() {
        if (!this.animationId) {
            this.enabled = true;
            this.animate();
        }
    }

    /**
     * Stop animation
     */
    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.enabled = false;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Toggle animation
     */
    toggle() {
        if (this.enabled) {
            this.stop();
        } else {
            this.start();
        }
    }
}

