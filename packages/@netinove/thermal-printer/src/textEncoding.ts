/**
 * Encodes plain text using the printer-safe ASCII subset.
 *
 * Diacritics are removed (for example, "ação" becomes "acao") and unsupported
 * characters are replaced with "?". No ESC/POS command is added.
 */
export function encodePlainText(text: string, trailingLines = 0): number[] {
  const normalized = text
    .replace(/\r\n?/g, '\n')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x0A\x20-\x7E]/g, '?');

  const safeTrailingLines = Math.max(0, Math.min(Math.trunc(trailingLines), 10));

  return [
    ...Array.from(normalized, (character) => character.charCodeAt(0)),
    ...Array(safeTrailingLines).fill(0x0a),
  ];
}
