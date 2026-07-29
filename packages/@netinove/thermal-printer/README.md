# @netinove/thermal-printer

Plain-text thermal printing over Android Bluetooth Classic for Expo and React Native.

## Requirements

- Expo SDK 53 or a compatible React Native application
- Android 7.0 (API 24) or newer
- A Bluetooth Classic printer with the Serial Port Profile (SPP)
- A development build or production build; Expo Go is not supported

Nearby devices can be discovered by the library. When `connect()` receives an unpaired device, it
asks Android to pair it before opening the connection.

## Installation

Install the package in the consumer application after it is published to the selected registry:

```sh
npm install @netinove/thermal-printer
```

Rebuild the Android application after installing or upgrading the package because it contains
native Kotlin code. The package manifest automatically contributes the required legacy Bluetooth
and location permissions, plus `BLUETOOTH_CONNECT` and `BLUETOOTH_SCAN` on Android 12+.

## Usage

```ts
import {
  addScanDeviceListener,
  addScanFinishedListener,
  connect,
  disconnect,
  getBluetoothState,
  requestBluetoothScanPermissions,
  startScan,
  stopScan,
  writeText,
} from '@netinove/thermal-printer';

const granted = await requestBluetoothScanPermissions();
if (!granted) {
  throw new Error('Bluetooth permission denied');
}

const bluetoothState = await getBluetoothState();
if (bluetoothState !== 'enabled') {
  throw new Error(`Bluetooth is ${bluetoothState}`);
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
  await disconnect();
  deviceSubscription.remove();
  finishedSubscription.remove();
}
```

`startScan()` resolves when discovery has started and does not return found devices. Subscribe
before starting the scan. Each device is emitted through `addScanDeviceListener()`, while
`addScanFinishedListener()` reports `completed`, `cancelled`, or `timeout`. The default timeout is
12 seconds; pass another duration to `startScan(timeoutMs)` or call `stopScan()` to cancel.

Use `requestBluetoothPermissions()` and `getBondedPrinters()` when the application only needs
previously paired devices and does not perform discovery.

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
| `chunkSize` | `512` | `32`–`4096` | Number of bytes written per block |
| `chunkDelayMs` | `30` | `0`–`500` | Delay between blocks |

`writeText` also accepts `trailingLines`, limited to a maximum of 10.

## Error codes

Native failures expose a stable `code` property:

| Code | Meaning |
| --- | --- |
| `ERR_BT_UNAVAILABLE` | Android device has no Bluetooth adapter |
| `ERR_BT_DISABLED` | Bluetooth is disabled |
| `ERR_PERMISSION_DENIED` | Android Bluetooth permission was not granted |
| `ERR_SCAN_IN_PROGRESS` | A discovery operation is already running |
| `ERR_SCAN_FAILED` | Android failed to start Bluetooth discovery |
| `ERR_PAIRING_FAILED` | Pairing was rejected, cancelled, or could not be started |
| `ERR_PAIRING_TIMEOUT` | Pairing did not complete within 30 seconds |
| `ERR_INVALID_ADDRESS` | Invalid Bluetooth MAC address |
| `ERR_CONNECTION_FAILED` | RFCOMM/SPP connection failed |
| `ERR_NOT_CONNECTED` | A write was requested without an active connection |
| `ERR_EMPTY_DATA` | No bytes were provided |
| `ERR_INVALID_BYTE` | A value outside `0`–`255` was provided |
| `ERR_WRITE_FAILED` | The socket failed while writing |

After `ERR_CONNECTION_FAILED` or `ERR_WRITE_FAILED`, the library closes and clears the current
socket. The application may call `connect` again.

## Development

```sh
npm run build
npm run lint
npm test
```

The Android example is located in `example/` and can be opened with:

```sh
npm run open:android
```
