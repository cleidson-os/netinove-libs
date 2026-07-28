export interface BluetoothPrinter {
  address: string;
  name: string;
  bonded: boolean;
}

export type BluetoothState = 'unsupported' | 'disabled' | 'enabled';

export interface ConnectionState {
  connected: boolean;
  address: string | null;
}

export interface WriteOptions {
  chunkSize?: number;
  chunkDelayMs?: number;
}

export interface WriteTextOptions extends WriteOptions {
  /** Appends this many line-feed characters after the text. Defaults to zero. */
  trailingLines?: number;
}

export type ThermalPrinterErrorCode =
  | 'ERR_PLATFORM_UNSUPPORTED'
  | 'ERR_CONTEXT_UNAVAILABLE'
  | 'ERR_BT_UNAVAILABLE'
  | 'ERR_BT_DISABLED'
  | 'ERR_PERMISSION_DENIED'
  | 'ERR_INVALID_ADDRESS'
  | 'ERR_CONNECTION_FAILED'
  | 'ERR_NOT_CONNECTED'
  | 'ERR_EMPTY_DATA'
  | 'ERR_INVALID_BYTE'
  | 'ERR_WRITE_FAILED';

export interface ThermalPrinterError extends Error {
  code: ThermalPrinterErrorCode;
}
