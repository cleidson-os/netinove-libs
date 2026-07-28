import { encodePlainText } from './textEncoding';

describe('encodePlainText', () => {
  it('encodes plain text without adding ESC/POS commands', () => {
    expect(encodePlainText('Olá\r\nação')).toEqual(
      Array.from('Ola\nacao', (character) => character.charCodeAt(0))
    );
  });

  it('replaces unsupported characters and appends line feeds', () => {
    expect(encodePlainText('Valor €', 2)).toEqual([
      ...Array.from('Valor ?', (character) => character.charCodeAt(0)),
      0x0a,
      0x0a,
    ]);
  });

  it('limits trailing lines to ten', () => {
    expect(encodePlainText('', 20)).toHaveLength(10);
  });
});
