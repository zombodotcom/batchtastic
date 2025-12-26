# 📖 Batchtastic Pro Documentation

## 🔌 Hardware Setup
- Use a high-quality powered USB hub for multiple nodes.
- Ensure your browser supports **Web Serial API** (Chrome, Edge, Opera).

## 🌐 OTA (Over-The-Air) Bulk Updates

**This is the killer feature.** Update an entire mesh network from a single connection point.

### How OTA Works:
1. **Connect Gateway Node**: Connect to ONE node via USB or BLE (this becomes your "gateway").
2. **Add OTA Targets**: Click "Add OTA Target" and enter the Meshtastic Node IDs of nodes you want to update (or leave blank to broadcast to all).
3. **Select Firmware**: Choose the firmware version you want to deploy.
4. **Broadcast**: Click "OTA Update All" - the gateway node broadcasts firmware chunks over the mesh network.

### OTA Use Cases:
- **Field Updates**: Update 50+ deployed nodes without visiting each one.
- **Emergency Patches**: Push critical firmware fixes to an entire mesh instantly.
- **Remote Maintenance**: Update nodes that are mounted on towers or in hard-to-reach locations.

### OTA Limitations:
- Nodes must already be on the mesh network (they need to be able to receive packets).
- The gateway node must have good connectivity to the targets.
- OTA updates are slower than direct USB flashing (mesh bandwidth is limited).

## 📶 BLE (Bluetooth) Connections
Web Bluetooth allows you to connect to Meshtastic nodes wirelessly.
- **Supported Browsers**: Chrome, Edge, Opera (Desktop & Android)
- **iOS Note**: Safari does not support Web Bluetooth. Use a Chromium-based browser on iOS if available.
- **How it Works**: BLE connections use the Meshtastic GATT service to inject configuration without needing to flash firmware.

### BLE UUIDs Used:
- Service: `6ba1b218-15a8-461f-9fa8-5dcae273eafd`
- ToRadio: `f75c76d2-129e-4dad-a1dd-7866124401e7`
- FromRadio: `2c55e69e-4993-11ed-b878-0242ac120002`

## 💾 Firmware Preparation
Meshtastic ESP32 firmware typically requires three files. Upload all three simultaneously in the **Firmware** card:
1. `bootloader.bin` (Auto-mapped to 0x0)
2. `partitions.bin` (Auto-mapped to 0x8000)
3. `firmware-xxx.bin` (Auto-mapped to 0x10000)

The tool uses filename detection to set these offsets. If you use a unified binary (e.g., from the web flasher), ensure it is the only file selected.

### Example Profile:
```json
{
  "name": "Community Relay",
  "region": "US",
  "channelName": "LongFast",
  "role": "ROUTER",
  "modemPreset": "LONG_FAST"
}
```

## 🛠️ Developer & TDD Guide

### 🧪 Running Tests
To ensure stability for other developers, we've included a **Browser-based Test Suite**.
- Open `test.html` in your browser.
- It uses **Mocha** and **Chai** to run unit tests against a **Mock Hardware System**.
- This allows you to verify state transitions and logic without needing physical ESP32 nodes connected.

### 🏗️ Test-Driven Development (TDD)
If you are adding a new "Mission" or hardware feature:
1. Update `MockSerialPort` in `test.html` to simulate the new hardware behavior.
2. Write a failing test in `test.html`.
3. Implement the feature in `index.html` until the test passes.

