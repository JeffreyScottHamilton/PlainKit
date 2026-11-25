// Pixel math for OCR preprocessing. Pure: operates on RGBA bytes, returns new bytes.

const CLIP = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Integer Rec. 601 luma (0.299 R + 0.587 G + 0.114 B), rounded. */
export function luma(r: number, g: number, b: number): number {
  return (77 * r + 150 * g + 29 * b + 128) >> 8;
}

/**
 * Lookup table that stretches the 1st..99th percentile of a grey histogram to 0..255.
 * Percentiles (not min/max) keep a few stray dark or light pixels from flattening the contrast.
 * Returns the identity table when the image has no usable spread.
 */
export function stretchTable(hist: ArrayLike<number>): Uint8ClampedArray {
  const table = new Uint8ClampedArray(256);
  let total = 0;
  for (let v = 0; v < 256; v++) total += hist[v] ?? 0;
  const lo = percentile(hist, total, 0.01);
  const hi = percentile(hist, total, 0.99);
  for (let v = 0; v < 256; v++) {
    table[v] = hi <= lo ? v : CLIP(Math.round(((v - lo) * 255) / (hi - lo)));
  }
  return table;
}

function percentile(hist: ArrayLike<number>, total: number, p: number): number {
  if (total === 0) return 0;
  const target = total * p;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v] ?? 0;
    if (acc >= target) return v;
  }
  return 255;
}

/**
 * Grey and/or auto-contrast an RGBA buffer. Grey writes luma into R, G and B. Auto-contrast applies
 * the percentile stretch to the grey values. Alpha is left as is. Input is not modified.
 */
export function preprocessRgba(src: Uint8ClampedArray, opts: { grayscale: boolean; autoContrast: boolean }): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src);
  if (!opts.grayscale && !opts.autoContrast) return out;
  const n = out.length / 4;
  const grey = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    grey[i] = luma(out[o] ?? 0, out[o + 1] ?? 0, out[o + 2] ?? 0);
  }
  let table: Uint8ClampedArray | null = null;
  if (opts.autoContrast) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < n; i++) hist[grey[i] ?? 0]!++;
    table = stretchTable(hist);
  }
  for (let i = 0; i < n; i++) {
    let g = grey[i] ?? 0;
    if (table) g = table[g] ?? g;
    const o = i * 4;
    out[o] = g;
    out[o + 1] = g;
    out[o + 2] = g;
  }
  return out;
}

/** Upscale factor (1 or 2). Only small images are doubled, and never past the pixel cap. */
export function upscaleFactor(width: number, height: number, enabled: boolean, maxPixels: number): number {
  if (!enabled || width < 1 || height < 1 || Math.max(width, height) >= 1600) return 1;
  let f = 2;
  while (f > 1 && width * f * height * f > maxPixels) f--;
  return f;
}
