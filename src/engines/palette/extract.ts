import { ToolError } from '@/lib/errors';
import { rgbToHex, type RGB } from './color';
import type { Rgba, Swatch } from './types';

// Deterministic dominant-color extraction: exact colors are counted on a subsampled copy, then
// weighted k-means++ runs in CIE Lab. Same input and k always give the same palette.
const ALPHA_MIN = 128;
const MAX_ITER = 30;
const SEED = 1;

type Lab = readonly [number, number, number];
type Point = RGB & { lab: Lab; w: number };

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const labF = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

export function rgbToLab({ r, g, b }: RGB): Lab {
  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);
  const fx = labF((0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047);
  const fy = labF(0.2126729 * R + 0.7151522 * G + 0.072175 * B);
  const fz = labF((0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const dist2 = (a: Lab, b: Lab) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

function nearest(centers: Lab[], lab: Lab): { j: number; d: number } {
  let j = 0;
  let d = Infinity;
  centers.forEach((c, i) => {
    const di = dist2(c, lab);
    if (di < d) {
      d = di;
      j = i;
    }
  });
  return { j, d };
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Index chosen with probability proportional to weights[i]. */
function pickIndex(weights: number[], r: number): number {
  let target = r * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    target -= weights[i] ?? 0;
    if (target < 0) return i;
  }
  return weights.length - 1;
}

const bySwatch = (a: Swatch, b: Swatch) => b.share - a.share || (a.hex < b.hex ? -1 : a.hex > b.hex ? 1 : 0);

/** Up to k colors sorted by share. Fewer are returned when the picture has fewer distinct colors. */
export function extractPalette(img: Rgba, k: number, maxSide = 256): Swatch[] {
  const step = Math.max(1, Math.ceil(Math.max(img.width, img.height) / maxSide));
  const counts = new Map<number, number>();
  let total = 0;
  for (let y = 0; y < img.height; y += step) {
    for (let x = 0; x < img.width; x += step) {
      const i = (y * img.width + x) * 4;
      if ((img.data[i + 3] ?? 0) < ALPHA_MIN) continue;
      const key = ((img.data[i] ?? 0) << 16) | ((img.data[i + 1] ?? 0) << 8) | (img.data[i + 2] ?? 0);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      total++;
    }
  }
  if (total === 0) {
    throw new ToolError('no-opaque-pixels', 'Every pixel is transparent, so there is no color to read.', 'Choose an image with visible colors.');
  }
  const pts: Point[] = [...counts]
    .sort((a, b) => a[0] - b[0])
    .map(([key, w]) => {
      const p = { r: (key >> 16) & 255, g: (key >> 8) & 255, b: key & 255 };
      return { ...p, lab: rgbToLab(p), w };
    });
  if (pts.length <= k) return pts.map((p) => ({ hex: rgbToHex(p), share: p.w / total })).sort(bySwatch);

  const weights = pts.map((p) => p.w);
  const rnd = mulberry32(SEED);
  const centers: Lab[] = [pts[pickIndex(weights, rnd())]!.lab];
  while (centers.length < k) {
    const d = pts.map((p, i) => (weights[i] ?? 0) * nearest(centers, p.lab).d);
    centers.push(pts[pickIndex(d, rnd())]!.lab);
  }

  const assign = new Int32Array(pts.length);
  const assignAll = () => {
    let changed = false;
    pts.forEach((p, i) => {
      const j = nearest(centers, p.lab).j;
      if (assign[i] !== j) {
        assign[i] = j;
        changed = true;
      }
    });
    return changed;
  };
  for (let iter = 0; iter < MAX_ITER; iter++) {
    if (!assignAll() && iter > 0) break;
    const acc = new Float64Array(k * 4);
    pts.forEach((p, i) => {
      const o = (assign[i] ?? 0) * 4;
      acc[o] = (acc[o] ?? 0) + p.lab[0] * p.w;
      acc[o + 1] = (acc[o + 1] ?? 0) + p.lab[1] * p.w;
      acc[o + 2] = (acc[o + 2] ?? 0) + p.lab[2] * p.w;
      acc[o + 3] = (acc[o + 3] ?? 0) + p.w;
    });
    for (let j = 0; j < k; j++) {
      const n = acc[j * 4 + 3] ?? 0;
      if (n > 0) centers[j] = [acc[j * 4]! / n, acc[j * 4 + 1]! / n, acc[j * 4 + 2]! / n];
    }
  }
  assignAll();

  // Report each cluster as the weighted mean of its real pixels, not the Lab centre.
  const cw = new Float64Array(k);
  const crgb = new Float64Array(k * 3);
  pts.forEach((p, i) => {
    const j = assign[i] ?? 0;
    cw[j] = (cw[j] ?? 0) + p.w;
    crgb[j * 3] = (crgb[j * 3] ?? 0) + p.r * p.w;
    crgb[j * 3 + 1] = (crgb[j * 3 + 1] ?? 0) + p.g * p.w;
    crgb[j * 3 + 2] = (crgb[j * 3 + 2] ?? 0) + p.b * p.w;
  });
  const out: Swatch[] = [];
  for (let j = 0; j < k; j++) {
    const n = cw[j] ?? 0;
    if (n === 0) continue;
    const rgb = { r: (crgb[j * 3] ?? 0) / n, g: (crgb[j * 3 + 1] ?? 0) / n, b: (crgb[j * 3 + 2] ?? 0) / n };
    out.push({ hex: rgbToHex(rgb), share: n / total });
  }
  return out.sort(bySwatch);
}
