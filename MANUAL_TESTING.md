# Manual Testing Checklist

This document provides a comprehensive checklist for manually testing all configuration features in Batchtastic Pro.

## UI Testing

### Configuration Panel
- [ ] Configuration panel opens when clicking "Configure All Devices" button
- [ ] All configuration tabs render correctly (Basic, LoRa, Device, Display, Network, Bluetooth, Position, Power, Modules)
- [ ] Tab switching works smoothly without errors
- [ ] Advanced toggle checkbox shows/hides advanced settings
- [ ] Form inputs accept valid values
- [ ] Form validation shows errors for invalid inputs (e.g., TX power > 30)
- [ ] Modal closes when clicking outside overlay
- [ ] Modal closes when clicking X button
- [ ] Preset dropdown populates correctly with saved presets
- [ ] Save preset button opens prompt for preset name
- [ ] Export button downloads JSON file
- [ ] Import button opens file picker

### Device Cards
- [ ] Device cards display correctly in grid layout
- [ ] Device selection works (click to select/deselect)
- [ ] Selected devices are visually highlighted
- [ ] Device status indicators show correct state
- [ ] Disconnected devices show "Connect" button
- [ ] Connected devices show configuration options

## Configuration Testing

### Basic Tab
- [ ] Region dropdown shows all available regions
- [ ] Region selection persists when switching tabs
- [ ] Channel name input accepts text
- [ ] Modem preset dropdown shows all presets
- [ ] Node role dropdown shows all roles
- [ ] TX Power input accepts numbers 0-30
- [ ] Hop Limit input accepts numbers 1-7
- [ ] All basic settings apply correctly to devices

### LoRa Tab
- [ ] Region setting applies correctly
- [ ] Modem preset applies correctly
- [ ] TX Power applies correctly
- [ ] Hop Limit applies correctly
- [ ] TX Enabled toggle works
- [ ] Bandwidth setting applies (advanced)
- [ ] Spread Factor setting applies (advanced)
- [ ] Coding Rate setting applies (advanced)
- [ ] Frequency Offset setting applies (advanced)
- [ ] Channel Number setting applies (advanced)

### Device Tab
- [ ] Role setting applies correctly
- [ ] Serial Enabled toggle works
- [ ] Debug Log Enabled toggle works (advanced)
- [ ] Button GPIO input accepts numbers (advanced)
- [ ] Buzzer GPIO input accepts numbers (advanced)
- [ ] Rebroadcast Mode dropdown works (advanced)
- [ ] Node Info Broadcast Seconds applies (advanced)

### Display Tab
- [ ] Screen On Seconds applies correctly
- [ ] GPS Format dropdown works
- [ ] Units dropdown (Metric/Imperial) works
- [ ] Auto Screen Carousel Seconds applies (advanced)
- [ ] Compass North Top toggle works (advanced)
- [ ] Flip Screen toggle works (advanced)
- [ ] OLED Type dropdown works (advanced)
- [ ] Display Mode dropdown works (advanced)

### Network Tab
- [ ] WiFi Enabled toggle works
- [ ] WiFi SSID input accepts text
- [ ] WiFi Password input masks text
- [ ] NTP Server input accepts text
- [ ] Address Mode dropdown works (advanced)
- [ ] IP Address input accepts valid IP format (advanced)
- [ ] Gateway input accepts valid IP format (advanced)
- [ ] Subnet input accepts valid subnet format (advanced)
- [ ] DNS Server input accepts text (advanced)

### Bluetooth Tab
- [ ] Bluetooth Enabled toggle works
- [ ] Pairing Pin input accepts numbers
- [ ] Fixed Pin input accepts numbers (advanced)
- [ ] Mode dropdown works (advanced)

### Position Tab
- [ ] GPS Enabled toggle works
- [ ] Position Broadcast Seconds applies correctly
- [ ] Position Broadcast Smart Enabled toggle works
- [ ] GPS Update Interval applies (advanced)
- [ ] GPS Attempt Time applies (advanced)
- [ ] Fixed Position toggle works (advanced)

### Power Tab
- [ ] Power Saving Enabled toggle works
- [ ] Battery Shutdown After Seconds applies correctly
- [ ] ADC Multiplier Override applies (advanced)
- [ ] Wait Bluetooth Seconds applies (advanced)

### Modules Tab
- [ ] Telemetry Module section renders
- [ ] Telemetry Device Update Interval applies
- [ ] Telemetry Environment Update Interval applies
- [ ] Telemetry Environment Measurement Enabled toggle works
- [ ] Telemetry Power Measurement Enabled toggle works
- [ ] Telemetry Environment Display Fahrenheit toggle works (advanced)
- [ ] Telemetry Air Quality Enabled toggle works (advanced)

- [ ] Serial Module section renders
- [ ] Serial Enabled toggle works
- [ ] Serial Baud Rate applies correctly
- [ ] Serial Echo toggle works (advanced)
- [ ] Serial RXD GPIO applies (advanced)
- [ ] Serial TXD GPIO applies (advanced)

- [ ] External Notification Module section renders
- [ ] External Notification Enabled toggle works
- [ ] External Notification Output GPIO applies
- [ ] External Notification Output Duration applies
- [ ] External Notification LED toggle works (advanced)
- [ ] External Notification Buzzer toggle works (advanced)
- [ ] External Notification Vibrate toggle works (advanced)

- [ ] Store & Forward Module section renders
- [ ] Store & Forward Enabled toggle works
- [ ] Store & Forward Heartbeat toggle works (advanced)
- [ ] Store & Forward Records applies (advanced)

- [ ] Range Test Module section renders
- [ ] Range Test Enabled toggle works
- [ ] Range Test Sender toggle works (advanced)
- [ ] Range Test Save toggle works (advanced)

- [ ] Canned Message Module section renders
- [ ] Canned Message Enabled toggle works
- [ ] Canned Message Allow Input Source dropdown works (advanced)

## Preset System Testing

### Preset Management
- [ ] Save Current as Preset button works
- [ ] Preset name prompt appears
- [ ] Preset saves with all current form values
- [ ] Preset appears in dropdown after saving
- [ ] Load Preset populates all form fields correctly
- [ ] Load Preset switches to correct tab if needed
- [ ] Delete Preset removes preset from list (if implemented)
- [ ] Presets persist across page reloads
- [ ] Multiple presets can be saved
- [ ] Preset with full config loads all sections correctly
- [ ] Preset with minimal config loads correctly

## Import/Export Testing

### Export Functionality
- [ ] Export button creates JSON file
- [ ] Exported JSON contains all configuration sections
- [ ] Exported JSON is valid and parseable
- [ ] Exported JSON includes metadata (timestamp, device info)
- [ ] Export works for single device configuration
- [ ] Export works for all devices configuration

### Import Functionality
- [ ] Import button opens file picker
- [ ] Valid JSON file imports successfully
- [ ] Imported config populates form fields correctly
- [ ] Import shows error for invalid JSON
- [ ] Import shows error for missing device
- [ ] Import works for single device configuration
- [ ] Import works for bulk device configuration

## Device Integration Testing

### USB Device Configuration
- [ ] Connect USB device via "Add USB" button
- [ ] Device appears in grid
- [ ] Configure device with Basic settings → Apply → Verify config sent
- [ ] Configure device with LoRa settings → Apply → Verify config sent
- [ ] Configure device with Device settings → Apply → Verify config sent
- [ ] Configure device with Display settings → Apply → Verify config sent
- [ ] Configure device with Network settings → Apply → Verify config sent
- [ ] Configure device with Bluetooth settings → Apply → Verify config sent
- [ ] Configure device with Position settings → Apply → Verify config sent
- [ ] Configure device with Power settings → Apply → Verify config sent
- [ ] Configure device with Module settings → Apply → Verify config sent
- [ ] Configure device with full config (all tabs) → Apply → Verify all configs sent

### BLE Device Configuration
- [ ] Connect BLE device via "Add BLE" button
- [ ] Device appears in grid
- [ ] Configure device → Apply → Verify config sent
- [ ] Full config applies correctly to BLE device

### Disconnected Device Workflow
- [ ] Click board type to add disconnected device
- [ ] Device name prompt appears
- [ ] Configuration modal opens after entering name
- [ ] Configure disconnected device
- [ ] Device appears in grid with "disconnected" status
- [ ] Click "Connect" button on disconnected device
- [ ] Connection type prompt appears (USB/BLE)
- [ ] Connect device → Config auto-applies
- [ ] Device status changes to "ready"

### Batch Configuration
- [ ] Select multiple devices
- [ ] Configure all selected devices → Apply → Verify all receive config
- [ ] Configure all devices (none selected) → Apply → Verify all receive config
- [ ] Batch configuration shows progress/status
- [ ] Batch configuration handles errors gracefully

## Error Handling Testing

### Validation Errors
- [ ] Invalid region shows error message
- [ ] TX Power > 30 shows error message
- [ ] TX Power < 0 shows error message
- [ ] Hop Limit > 7 shows error message
- [ ] Hop Limit < 1 shows error message
- [ ] Invalid device role shows error message
- [ ] Empty required fields show error message

### Connection Errors
- [ ] Device disconnects during config → Error handled gracefully
- [ ] USB connection fails → Error message shown
- [ ] BLE connection fails → Error message shown
- [ ] Config injection fails → Error logged, device remains usable

### Data Errors
- [ ] Invalid JSON import → Error message shown
- [ ] Missing device in import → Error message shown
- [ ] Corrupted preset data → Error handled gracefully
- [ ] localStorage quota exceeded → Error handled gracefully

## Performance Testing

- [ ] Configuration panel opens quickly (< 500ms)
- [ ] Tab switching is smooth (< 100ms)
- [ ] Form inputs respond immediately
- [ ] Config application completes in reasonable time (< 5s per device)
- [ ] Batch config application handles 10+ devices efficiently
- [ ] Preset loading is instant
- [ ] Export/Import operations complete quickly

## Browser Compatibility

- [ ] Chrome/Edge: All features work correctly
- [ ] Firefox: All features work correctly
- [ ] Safari: All features work correctly (if applicable)
- [ ] Mobile browsers: UI is usable (if applicable)

## Edge Cases

- [ ] Configure device with no settings changed → Should handle gracefully
- [ ] Configure device with only advanced settings → Should work
- [ ] Save preset with empty config → Should handle gracefully
- [ ] Load preset when no devices connected → Should handle gracefully
- [ ] Export config when no devices → Should handle gracefully
- [ ] Import config with extra fields → Should handle gracefully
- [ ] Switch tabs rapidly → Should not cause errors
- [ ] Close modal during config application → Should handle gracefully

## Notes

- Test with actual Meshtastic devices when possible
- Verify config changes are reflected on device
- Test with different firmware versions if available
- Document any browser-specific issues
- Note any performance issues with large device counts

