import { normalizeConnectOptions } from './connectOptions';

describe('normalizeConnectOptions', () => {
  it('keeps the backwards-compatible empty options object', () => {
    expect(normalizeConnectOptions()).toEqual({});
  });

  it('normalizes a complete BLE UUID pair', () => {
    expect(normalizeConnectOptions({ serviceUUID: ' 18f0 ', characteristicUUID: '2af1' })).toEqual({
      serviceUUID: '18F0',
      characteristicUUID: '2AF1',
    });
  });

  it('rejects a partial BLE UUID pair', () => {
    expect(() => normalizeConnectOptions({ serviceUUID: '18F0' })).toThrow(
      'must be provided together'
    );
  });

  it('rejects malformed UUIDs', () => {
    expect(() =>
      normalizeConnectOptions({ serviceUUID: 'printer', characteristicUUID: '2AF1' })
    ).toThrow('Invalid Bluetooth UUID');
  });
});
