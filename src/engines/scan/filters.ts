import type { Filter, Raster } from './types';

// shortcut: block-maximum background instead of a full illumination model, fixed paper gain, no colour cast beyond per-channel gain. Upgrade: per-channel percentile levels measured on real receipts.
const PAPER_GAIN = 0.94;
/** Paper pixels at or above this fraction of the local mean stay white. Text is far darker than that. */
const BW_RATIO = 0.85;

export function applyFilter(r: Raster, filter: Filter): Raster {
  switch (filter) {
    case 'original':
      return r;
    case 'gray':
      return grayscale(r);
    case 'bw':
      return binarize(r);
    case 'enhanced':
      return flattenPaper(r);
  }
}

export function luminance(data: Uint8ClampedArray, i: number): number {
  return (data[i]! * 77 + data[i + 1]! * 150 + data[i + 2]! * 29) >> 8;
}

export function grayscale(r: Raster): Raster {
  const out = new Uint8ClampedArray(r.data.length);
  for (let i = 0; i < r.data.length; i += 4) {
    const g = luminance(r.data, i);
    out[i] = g;
    out[i + 1] = g;
    out[i + 2] = g;
    out[i + 3] = 255;
  }
  return { width: r.width, height: r.height, data: out };
}

/** Black and white with a local-mean threshold, so a shadow lowers the threshold with the paper beside it. */
export function binarize(r: Raster): Raster {
  const n = r.width * r.height;
  const gray = new Uint8Array(n);
  for (let i = 0; i < n; i++) gray[i] = luminance(r.data, i * 4);
  const bits = adaptiveBinarize(gray, r.width, r.height);
  const out = new Uint8ClampedArray(r.data.length);
  for (let i = 0; i < n; i++) {
    const v = bits[i]!;
    out[i * 4] = v;
    out[i * 4 + 1] = v;
    out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return { width: r.width, height: r.height, data: out };
}

/** Returns 0 (text) or 255 (paper) per pixel. Window radius scales with the image so it spans a few text lines. */
export function adaptiveBinarize(gray: Uint8Array, w: number, h: number): Uint8Array {
  const rad = Math.max(8, Math.round(Math.min(w, h) / 30));
  const W = w + 1;
  const integral = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x]!;
      integral[(y + 1) * W + x + 1] = integral[y * W + x + 1]! + row;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - rad);
    const y1 = Math.min(h - 1, y + rad);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - rad);
      const x1 = Math.min(w - 1, x + rad);
      const sum = integral[(y1 + 1) * W + x1 + 1]! - integral[y0 * W + x1 + 1]! - integral[(y1 + 1) * W + x0]! + integral[y0 * W + x0]!;
      const mean = sum / ((x1 - x0 + 1) * (y1 - y0 + 1));
      out[y * w + x] = gray[y * w + x]! >= mean * BW_RATIO ? 255 : 0;
    }
  }
  return out;
}

/**
 * Divides each channel by the local paper colour (block maximum, interpolated), so shadows fade and the paper goes white.
 * Dark text stays dark because text covers only part of each block, so the block maximum is still the paper.
 */
export function flattenPaper(r: Raster): Raster {
  const { width: w, height: h, data } = r;
  const B = Math.max(8, Math.round(Math.min(w, h) / 24));
  const gw = Math.ceil(w / B);
  const gh = Math.ceil(h / B);
  const cells = new Float32Array(gw * gh * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = (Math.floor(y / B) * gw + Math.floor(x / B)) * 3;
      const i = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) if (data[i + k]! > cells[c + k]!) cells[c + k] = data[i + k]!;
    }
  }
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(gh - 1, Math.max(0, (y + 0.5) / B - 0.5));
    const cy0 = Math.floor(fy);
    const cy1 = Math.min(gh - 1, cy0 + 1);
    const ty = fy - cy0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(gw - 1, Math.max(0, (x + 0.5) / B - 0.5));
      const cx0 = Math.floor(fx);
      const cx1 = Math.min(gw - 1, cx0 + 1);
      const tx = fx - cx0;
      const i = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) {
        const top = cells[(cy0 * gw + cx0) * 3 + k]! + (cells[(cy0 * gw + cx1) * 3 + k]! - cells[(cy0 * gw + cx0) * 3 + k]!) * tx;
        const bot = cells[(cy1 * gw + cx0) * 3 + k]! + (cells[(cy1 * gw + cx1) * 3 + k]! - cells[(cy1 * gw + cx0) * 3 + k]!) * tx;
        const b = Math.max(1, top + (bot - top) * ty);
        out[i + k] = (data[i + k]! * 255) / (b * PAPER_GAIN) + 0.5;
      }
      out[i + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}
