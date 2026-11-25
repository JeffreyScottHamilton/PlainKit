/**
 * Makes near-white pixels fully transparent, in place. `data` is RGBA bytes.
 * shortcut: hard threshold, no feathering, so anti-aliased edges of a logo can show a faint light fringe.
 */
export function keyWhite(data: Uint8ClampedArray, threshold = 240): void {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    if (r >= threshold && g >= threshold && b >= threshold) data[i + 3] = 0;
  }
}
