# @netinove/thermal-printer

Plain-text thermal printing over Android Bluetooth Classic and iOS Bluetooth Low Energy (BLE)
for Expo and React Native.

## Requirements

- Expo SDK 53 or a compatible React Native application
- Android 7.0 (API 24) or newer, or iOS 15.1 or newer
- Android: a Bluetooth Classic printer with the Serial Port Profile (SPP)
- iOS: a BLE printer exposing a writable GATT characteristic
- A development build or production build; Expo Go is not supported

Nearby devices can be discovered by the library. Android asks to pair unpaired Classic devices
before opening the connection. iOS discovers BLE services and characteristics after connecting.
Bluetooth Classic printers without BLE or Apple MFi support cannot be used from iOS.

## Installation

Install the package in the consumer application after it is published to the selected registry:

```sh
npm install @netinove/thermal-printer
```

Rebuild the native application after installing or upgrading the package because it contains
Kotlin and Swift code. The Android manifest contributes the required Bluetooth and location
permissions. iOS applications must provide `NSBluetoothAlwaysUsageDescription` in app config:

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSBluetoothAlwaysUsageDescription": "Permite buscar e conectar impressoras Bluetooth.",
        "UIBackgroundModes": ["bluetooth-central"]
      }
    }
  }
}
```

`bluetooth-central` enables CoreBluetooth state restoration, matching the initialization used by
the iOS transport. Use a stable application bundle identifier so iOS can associate restored BLE
state with the same app installation.

## Usage

```ts
import {
  addScanDeviceListener,
  addScanFinishedListener,
  connect,
  disconnect,
  requestBluetoothScanPermissions,
  startScan,
  stopScan,
  writeText,
} from '@netinove/thermal-printer';

const granted = await requestBluetoothScanPermissions();
if (!granted) {
  throw new Error('Bluetooth permission denied');
}

const devices = new Map();
const deviceSubscription = addScanDeviceListener(device => {
  devices.set(device.address, device);
});
const finishedSubscription = addScanFinishedListener(({ reason }) => {
  console.log(`Scan finished: ${reason}`);
});

await startScan();

// Later, after selecting a device emitted by the scan:
const printer = [...devices.values()][0];
if (!printer) throw new Error('No printer selected');
await connect(printer.address);

try {
  await writeText('Texto corrido\nSegunda linha', { trailingLines: 3 });
} finally {
  await disconnect({ drainDelayMs: 2_000 });
  deviceSubscription.remove();
  finishedSubscription.remove();
}
```

On Android, `disconnect({ drainDelayMs })` keeps the RFCOMM socket open for the requested interval
before closing it. This can prevent the end of a print job from being discarded on devices whose
Bluetooth stack still has queued bytes after `write` resolves. The value is limited to 10 seconds
and defaults to zero. Prefer keeping the connection open between print jobs; use a drain delay only
when the application must disconnect immediately after printing. The option is ignored on iOS.

`startScan()` resolves when discovery has started and does not return found devices. Subscribe
before starting the scan. Each device is emitted through `addScanDeviceListener()`, while
`addScanFinishedListener()` reports `completed`, `cancelled`, or `timeout`. The default timeout is
12 seconds; pass another duration to `startScan(timeoutMs)` or call `stopScan()` to cancel.

Operations that require Bluetooth (`startScan`, `getBondedPrinters`, `connect`, and `write`) check
the radio state automatically. Android displays its system activation dialog and continues after
the user accepts. iOS displays the system Bluetooth power alert; because iOS cannot turn the radio
on for an app, retry the operation after enabling Bluetooth. `turnOnBluetooth()` is also exported
for applications that want to request activation before one of these operations.

On iOS, `address` is the peripheral UUID assigned by the operating system and `bonded` is always
`false`. On Android, `address` remains the device MAC address. `getBondedPrinters()` is Android-only
and rejects with `ERR_PLATFORM_UNSUPPORTED` on iOS because Apple does not expose a paired-device
list for generic BLE peripherals.

Use `requestBluetoothPermissions()` and `getBondedPrinters()` on Android when the application only
needs previously paired devices and does not perform discovery.

### Selecting the iOS BLE characteristic

By default, `connect(address)` discovers all services and chooses a writable characteristic,
preferring `writeWithoutResponse` over `write`. Printers with multiple writable characteristics
can be configured explicitly:

```ts
await connect(printer.address, {
  serviceUUID: '18F0',
  characteristicUUID: '2AF1',
});
```

The two UUIDs must be provided together. Bluetooth SIG short UUIDs and canonical 128-bit UUIDs are
accepted. These options are ignored by the unchanged Android Classic transport.

`writeText` sends only text bytes and line feeds. It does not add ESC/POS initialization or
formatting commands. For broad printer compatibility, accents are normalized to ASCII (`ação`
becomes `acao`) and unsupported characters are replaced with `?`.

Use `write(bytes)` when the application already has the bytes to send:

```ts
await write([0x54, 0x65, 0x73, 0x74, 0x65, 0x0a]);
```

## Transport options

Both `write` and `writeText` accept:

| Option | Default | Accepted natively | Description |
| --- | ---: | ---: | --- |
| `chunkSize` | `512` | `32`–`4096` | Requested bytes per block; iOS also applies the peripheral's BLE maximum |
| `chunkDelayMs` | `30` | `0`–`500` | Delay between blocks |

`writeText` also accepts `trailingLines`, limited to a maximum of 10.

## Error codes

Native failures expose a stable `code` property:

| Code | Meaning |
| --- | --- |
| `ERR_PLATFORM_UNSUPPORTED` | The operation is not exposed on the current platform |
| `ERR_BT_UNAVAILABLE` | Bluetooth is not available |
| `ERR_BT_DISABLED` | Bluetooth is disabled |
| `ERR_BT_ENABLE_IN_PROGRESS` | An Android Bluetooth activation request is already open |
| `ERR_PERMISSION_DENIED` | Bluetooth permission was not granted |
| `ERR_SCAN_IN_PROGRESS` | A discovery operation is already running |
| `ERR_SCAN_FAILED` | Android failed to start Bluetooth discovery |
| `ERR_SERVICE_NOT_FOUND` | iOS could not discover the requested BLE service |
| `ERR_CHARACTERISTIC_NOT_FOUND` | iOS could not find a writable BLE characteristic |
| `ERR_PAIRING_FAILED` | Pairing was rejected, cancelled, or could not be started |
| `ERR_PAIRING_TIMEOUT` | Pairing did not complete within 30 seconds |
| `ERR_INVALID_ADDRESS` | Invalid Bluetooth MAC, peripheral UUID or BLE option |
| `ERR_CONNECTION_FAILED` | Bluetooth connection failed |
| `ERR_NOT_CONNECTED` | A write was requested without an active connection |
| `ERR_EMPTY_DATA` | No bytes were provided |
| `ERR_INVALID_BYTE` | A value outside `0`–`255` was provided |
| `ERR_WRITE_FAILED` | The socket failed while writing |

After `ERR_CONNECTION_FAILED` or `ERR_WRITE_FAILED`, the library clears the current transport. The
application may call `connect` again.

## Development

```sh
npm run build
npm run lint
npm test
```

The example is located in `example/` and can be opened with:

```sh
npm run open:android
npm run open:ios
```

BLE discovery and printing must be validated on a physical iPhone; the iOS Simulator does not
provide a representative BLE-printer workflow.

### EAS Build

The example includes `eas.json` profiles for cloud builds. From the `example/` directory, install
and authenticate the EAS CLI, then link the example to an Expo project on the first run:

```sh
npm install --global eas-cli
eas login
eas init
```

Build a development client for physical Android and iOS devices:

```sh
npm run eas:development
```

Other available commands are:

| Command | Result |
| --- | --- |
| `npm run eas:development:ios` | iOS development client for a registered physical device |
| `npm run eas:development:simulator` | iOS development client for Simulator |
| `npm run eas:preview` | Internally distributed production-like Android and iOS builds |
| `npm run eas:preview:simulator` | Production-like build for iOS Simulator |
| `npm run eas:production` | Store-ready Android AAB and iOS archive |

Internal iOS builds require an Apple Developer account and a registered device. Simulator builds
validate the application but cannot validate communication with a BLE printer.
