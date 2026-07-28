# @netinove/thermal-printer

Plain-text thermal printing over Android Bluetooth Classic for Expo and React Native.

## Requirements

- Expo SDK 53 or a compatible React Native application
- Android 7.0 (API 24) or newer
- A Bluetooth Classic printer with the Serial Port Profile (SPP)
- A development build or production build; Expo Go is not supported

The printer must be paired in Android settings before the library can list it. Active Bluetooth
discovery is not implemented in version `0.1.0`.

## Installation

Install the package in the consumer application after it is published to the selected registry:

```sh
npm install @netinove/thermal-printer
```

Rebuild the Android application after installing or upgrading the package because it contains
native Kotlin code. The package manifest automatically contributes the required legacy Bluetooth
permissions and `BLUETOOTH_CONNECT` on Android 12+.

## Usage

```ts
import {
  connect,
  disconnect,
  getBluetoothState,
  getBondedPrinters,
  requestBluetoothPermissions,
  writeText,
} from '@netinove/thermal-printer';

const granted = await requestBluetoothPermissions();
if (!granted) {
  throw new Error('Bluetooth permission denied');
}

const bluetoothState = await getBluetoothState();
if (bluetoothState !== 'enabled') {
  throw new Error(`Bluetooth is ${bluetoothState}`);
}

const [printer] = await getBondedPrinters();
await connect(printer.address);

try {
  await writeText('Texto corrido\nSegunda linha', { trailingLines: 3 });
} finally {
  await disconnect();
}
```

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
