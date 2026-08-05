import { PermissionsAndroid, Platform } from 'react-native';

import type {
  BluetoothDevice,
  BluetoothScanFinishedEvent,
  BluetoothScanSubscription,
  ConnectOptions,
  WriteOptions,
  WriteTextOptions,
} from './NetinoveThermalPrinter.types';
import NetinoveThermalPrinterModule from './NetinoveThermalPrinterModule';
import { OperationQueue } from './OperationQueue';
import { normalizeConnectOptions } from './connectOptions';
import { encodePlainText } from './textEncoding';

const DEFAULT_CHUNK_SIZE = 512;
const DEFAULT_CHUNK_DELAY_MS = 30;
const DEFAULT_SCAN_TIMEOUT_MS = 12_000;

const operationQueue = new OperationQueue();

function assertNativePlatform(): void {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    throw Object.assign(new Error('Bluetooth printing is available only on Android and iOS'), {
      code: 'ERR_PLATFORM_UNSUPPORTED',
    });
  }
}

export async function requestBluetoothPermissions(): Promise<boolean> {
  assertNativePlatform();
  if (Platform.OS === 'ios') return NetinoveThermalPrinterModule.requestBluetoothPermissions();
  if (Number(Platform.Version) < 31) return true;

  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

/** Requests the permissions required to discover nearby Bluetooth devices. */
export async function requestBluetoothScanPermissions(): Promise<boolean> {
  assertNativePlatform();
  if (Platform.OS === 'ios') return NetinoveThermalPrinterModule.requestBluetoothPermissions();

  if (Number(Platform.Version) >= 31) {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return (
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
        PermissionsAndroid.RESULTS.GRANTED &&
      result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
        PermissionsAndroid.RESULTS.GRANTED
    );
  }

  if (Number(Platform.Version) < 23) return true;
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export async function getBluetoothState() {
  assertNativePlatform();
  return NetinoveThermalPrinterModule.getBluetoothState();
}

export async function getBondedPrinters() {
  assertNativePlatform();
  return NetinoveThermalPrinterModule.getBondedPrinters();
}

/** Starts discovery. Found devices and completion are delivered exclusively through events. */
export async function startScan(timeoutMs = DEFAULT_SCAN_TIMEOUT_MS): Promise<void> {
  assertNativePlatform();
  await NetinoveThermalPrinterModule.startScan(timeoutMs);
}

export async function stopScan(): Promise<void> {
  assertNativePlatform();
  await NetinoveThermalPrinterModule.stopScan();
}

export function addScanDeviceListener(
  listener: (device: BluetoothDevice) => void
): BluetoothScanSubscription {
  assertNativePlatform();
  return NetinoveThermalPrinterModule.addListener('onDeviceFound', listener);
}

export function addScanFinishedListener(
  listener: (event: BluetoothScanFinishedEvent) => void
): BluetoothScanSubscription {
  assertNativePlatform();
  return NetinoveThermalPrinterModule.addListener('onScanFinished', listener);
}

export function connect(address: string, options: ConnectOptions = {}) {
  assertNativePlatform();
  const normalizedOptions = normalizeConnectOptions(options);
  return operationQueue.enqueue(() =>
    Platform.OS === 'ios'
      ? NetinoveThermalPrinterModule.connect(address, normalizedOptions)
      : NetinoveThermalPrinterModule.connect(address)
  );
}

export function getConnectionState() {
  assertNativePlatform();
  return NetinoveThermalPrinterModule.getConnectionState();
}

export function write(bytes: number[], options: WriteOptions = {}): Promise<void> {
  assertNativePlatform();
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const chunkDelayMs = options.chunkDelayMs ?? DEFAULT_CHUNK_DELAY_MS;
  return operationQueue.enqueue(() =>
    NetinoveThermalPrinterModule.write(bytes, chunkSize, chunkDelayMs)
  );
}

/** Sends plain ASCII text without adding ESC/POS formatting commands. */
export function writeText(text: string, options: WriteTextOptions = {}): Promise<void> {
  const { trailingLines = 0, ...writeOptions } = options;
  return write(encodePlainText(text, trailingLines), writeOptions);
}

export function disconnect(): Promise<void> {
  assertNativePlatform();
  return operationQueue.enqueue(() => NetinoveThermalPrinterModule.disconnect());
}

export default NetinoveThermalPrinterModule;
export * from './NetinoveThermalPrinter.types';
export { encodePlainText } from './textEncoding';
