# ⚡ Batchtastic Pro

A professional, client-side toolkit for bulk-flashing, configuring, and diagnosing Meshtastic nodes. Designed for community deployments, emergency response kits, and mesh enthusiasts.

## 🚀 Features

- **Parallel Flashing**: Flash multiple ESP32/nRF52 nodes simultaneously using Web Serial.
- **📶 BLE Support**: Connect and configure nodes wirelessly via Web Bluetooth API.
- **🌐 OTA Bulk Updates**: Update entire mesh networks over-the-air from a single gateway node.
- **Auto-Config**: Automatically injects Meshtastic settings (Channels, Region, Roles) post-flash.
- **Hardware HUD**: Real-time telemetry (Battery, SNR, Air Util) from all connected nodes.
- **Netlify Ready**: 100% client-side. No backend required.

## 🛠️ Usage

1. Open the hosted URL in a Web Serial compatible browser (Chrome, Edge).
2. Connect your nodes via a USB hub.
3. Select your firmware and mission profile.
4. Click **Flash & Deploy All**.

## 📖 Documentation
Detailed technical guides and firmware instructions are in [DOCS.md](./DOCS.md).

## 🛠️ Development

This project uses **Vite** for a professional development experience.

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run test suite (TDD)
npm run test

# Build for production (Netlify automatically does this)
npm run build
```

## 🛠️ Developer Guide
The system is a modular Vite app. Logic is in `src/BatchManager.js`.
