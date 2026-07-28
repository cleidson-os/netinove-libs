import { PermissionsAndroid, Platform } from 'react-native';

import type { WriteOptions, WriteTextOptions } from './NetinoveThermalPrinter.types';
import NetinoveThermalPrinterModule from './NetinoveThermalPrinterModule';
import { OperationQueue } from './OperationQueue';
import { encodePlainText } from './textEncoding';

const DEFAULT_CHUNK_SIZE = 512;
const DEFAULT_CHUNK_DELAY_MS = 30;

const operationQueue = new OperationQueue();

function assertAndroid(): void {
  if (Platform.OS !== 'android') {
    throw Object.assign(new Error('Bluetooth Classic is available only on Android'), {
      code: 'ERR_PLATFORM_UNSUPPORTED',
    });
  }
}

export async function requestBluetoothPermissions(): Promise<boolean> {
  assertAndroid();
  if (Number(Platform.Version) < 31) return true;

  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export async function getBluetoothState() {
  assertAndroid();
  return NetinoveThermalPrinterModule.getBluetoothState();
}

export async function getBondedPrinters() {
  assertAndroid();
  return NetinoveThermalPrinterModule.getBondedPrinters();
}

export function connect(address: string) {
  assertAndroid();
  return operationQueue.enqueue(() => NetinoveThermalPrinterModule.connect(address));
}

export function getConnectionState() {
  assertAndroid();
  return NetinoveThermalPrinterModule.getConnectionState();
}

export function write(bytes: number[], options: WriteOptions = {}): Promise<void> {
  assertAndroid();
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
  assertAndroid();
  return operationQueue.enqueue(() => NetinoveThermalPrinterModule.disconnect());
}

export default NetinoveThermalPrinterModule;
export * from './NetinoveThermalPrinter.types';
export { encodePlainText } from './textEncoding';
