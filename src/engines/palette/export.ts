/** `:root` block with one variable per color, numbered from 1 in palette order. */
export function cssVariables(hexes: readonly string[]): string {
  return `:root {\n${hexes.map((h, i) => `  --color-${i + 1}: ${h};`).join('\n')}\n}\n`;
}

/** One HEX value per line. */
export function hexList(hexes: readonly string[]): string {
  return hexes.map((h) => `${h}\n`).join('');
}
