import type { ConnectOptions } from './NetinoveThermalPrinter.types';

const BLUETOOTH_UUID =
  /^(?:[0-9a-f]{4}|[0-9a-f]{8}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function normalizeConnectOptions(options: ConnectOptions = {}): ConnectOptions {
  const serviceUUID = options.serviceUUID?.trim();
  const characteristicUUID = options.characteristicUUID?.trim();

  if (Boolean(serviceUUID) !== Boolean(characteristicUUID)) {
    throw Object.assign(new Error('serviceUUID and characteristicUUID must be provided together'), {
      code: 'ERR_INVALID_ADDRESS',
    });
  }

  if (
    (serviceUUID && !BLUETOOTH_UUID.test(serviceUUID)) ||
    (characteristicUUID && !BLUETOOTH_UUID.test(characteristicUUID))
  ) {
    throw Object.assign(new Error('Invalid Bluetooth UUID'), { code: 'ERR_INVALID_ADDRESS' });
  }

  return serviceUUID && characteristicUUID
    ? {
        serviceUUID: serviceUUID.toUpperCase(),
        characteristicUUID: characteristicUUID.toUpperCase(),
      }
    : {};
}
