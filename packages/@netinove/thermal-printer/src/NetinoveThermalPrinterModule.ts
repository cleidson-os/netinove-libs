import { NativeModule, requireNativeModule } from 'expo';

import type {
  BluetoothPrinter,
  BluetoothState,
  ConnectionState,
} from './NetinoveThermalPrinter.types';

declare class NetinoveThermalPrinterModule extends NativeModule<Record<string, never>> {
  getBluetoothState(): Promise<BluetoothState>;
  getBondedPrinters(): Promise<BluetoothPrinter[]>;
  connect(address: string): Promise<ConnectionState>;
  getConnectionState(): ConnectionState;
  write(bytes: number[], chunkSize: number, chunkDelayMs: number): Promise<void>;
  disconnect(): Promise<void>;
}

export default requireNativeModule<NetinoveThermalPrinterModule>('NetinoveThermalPrinter');
