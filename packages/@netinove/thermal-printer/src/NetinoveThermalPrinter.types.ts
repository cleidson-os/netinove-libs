export interface BluetoothPrinter {
  address: string;
  name: string;
  bonded: boolean;
  /** iOS BLE diagnostics. These fields are omitted by transports that do not expose them. */
  rssi?: number;
  advertisedName?: string;
  serviceUUIDs?: string[];
  manufacturerData?: string;
  connectable?: boolean;
  discoveryCount?: number;
}

export type BluetoothDevice = BluetoothPrinter;

export type BluetoothScanFinishReason = 'completed' | 'cancelled' | 'timeout';

export interface BluetoothScanFinishedEvent {
  reason: BluetoothScanFinishReason;
}

export type NetinoveThermalPrinterEvents = {
  onDeviceFound(device: BluetoothDevice): void;
  onScanFinished(event: BluetoothScanFinishedEvent): void;
};

export interface BluetoothScanSubscription {
  remove(): void;
}

export type BluetoothState = 'unsupported' | 'disabled' | 'enabled';

export interface ConnectionState {
  connected: boolean;
  address: string | null;
}

export interface ConnectOptions {
  /** BLE service UUID used on iOS. Must be provided together with characteristicUUID. */
  serviceUUID?: string;
  /** Writable BLE characteristic UUID used on iOS. Must be provided together with serviceUUID. */
  characteristicUUID?: string;
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
  | 'ERR_BT_ENABLE_IN_PROGRESS'
  | 'ERR_PERMISSION_DENIED'
  | 'ERR_SCAN_IN_PROGRESS'
  | 'ERR_SCAN_FAILED'
  | 'ERR_SERVICE_NOT_FOUND'
  | 'ERR_CHARACTERISTIC_NOT_FOUND'
  | 'ERR_PAIRING_FAILED'
  | 'ERR_PAIRING_TIMEOUT'
  | 'ERR_INVALID_ADDRESS'
  | 'ERR_CONNECTION_FAILED'
  | 'ERR_NOT_CONNECTED'
  | 'ERR_EMPTY_DATA'
  | 'ERR_INVALID_BYTE'
  | 'ERR_WRITE_FAILED';

export interface ThermalPrinterError extends Error {
  code: ThermalPrinterErrorCode;
}
