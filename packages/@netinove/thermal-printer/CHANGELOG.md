# Changelog

## 0.3.0 - 2026-08-05

### 🛠 Breaking changes

### 🎉 New features

- Added iOS Bluetooth Low Energy discovery, connection and plain-text printing.
- Added optional service and characteristic UUID selection for BLE printers.

### 🐛 Bug fixes

- Prevented local installation in EAS Build from running the package TypeScript compiler without
  its development dependencies.
- Added a React Native source entry point so the example does not depend on ignored build artifacts.
- Moved the CoreBluetooth delegate conformances to an `NSObject` helper so the Swift module builds
  with Expo Modules Core.
- Declared the module as an Apple Expo module and provided its root Podspec path so SDK 53 includes
  it in `ExpoModulesProvider`.
- Matched the iOS scanner initialization used by `react-native-ble-manager` 11.5.5, including
  CoreBluetooth state restoration, main-queue callbacks and clearing disconnected scan cache.

### 💡 Others

- Added the iOS native module, CocoaPods specification and Bluetooth usage description to the example.

## 0.2.0 - 2026-07-29

### 🎉 New features

- Added event-based Bluetooth Classic discovery with explicit scan permissions and cancellation.
- Added automatic pairing before connecting to an unpaired device.

### 🐛 Bug fixes

- Fixed discovery broadcasts on Android 13 and newer.

## 0.1.0

- Added Android Bluetooth Classic SPP transport.
- Added paired-device listing, connection state, writing and disconnect APIs.
- Added plain-text ASCII encoding without ESC/POS formatting commands.
- Added Expo SDK 53 example application.

### 💡 Others

- Updated the example application and package documentation for discovery and pairing.
