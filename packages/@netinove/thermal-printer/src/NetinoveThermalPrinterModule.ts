import { NativeModule, requireNativeModule } from 'expo';

import type {
  BluetoothPrinter,
  BluetoothState,
  ConnectOptions,
  ConnectionState,
  NetinoveThermalPrinterEvents,
} from './NetinoveThermalPrinter.types';

declare class NetinoveThermalPrinterModule extends NativeModule<NetinoveThermalPrinterEvents> {
  getBluetoothState(): Promise<BluetoothState>;
  requestBluetoothPermissions(): Promise<boolean>;
  getBondedPrinters(): Promise<BluetoothPrinter[]>;
  startScan(timeoutMs: number): Promise<void>;
  stopScan(): Promise<void>;
  connect(address: string, options?: ConnectOptions): Promise<ConnectionState>;
  getConnectionState(): ConnectionState;
  write(bytes: number[], chunkSize: number, chunkDelayMs: number): Promise<void>;
  disconnect(): Promise<void>;
}

export default requireNativeModule<NetinoveThermalPrinterModule>('NetinoveThermalPrinter');
