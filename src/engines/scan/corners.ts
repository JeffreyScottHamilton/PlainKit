import type { Pt, Quad, Raster } from './types';

// Deterministic page detection: downscale, grayscale, blur, Otsu threshold, largest bright region,
// then the region's extreme points in the four diagonal directions are the corners.
// shortcut: a page on a light background, or with a bright margin touching the photo edge, is not separated; the full-photo fallback is used. Upgrade: an edge-based quadrilateral fit.
const SAMPLE_MAX = 240;
const FALLBACK_INSET = 0.04;
const MIN_AREA = 0.08;

export function fullPageQuad(inset = FALLBACK_INSET): Quad {
  const a = inset;
  const b = 1 - inset;
  return [
    { x: a, y: a },
    { x: b, y: a },
    { x: b, y: b },
    { x: a, y: b },
  ];
}

export function detectPage(r: Raster): { quad: Quad; detected: boolean } {
  const fallback = { quad: fullPageQuad(), detected: false };
  const stride = Math.max(1, Math.ceil(Math.max(r.width, r.height) / SAMPLE_MAX));
  const w = Math.floor(r.width / stride);
  const h = Math.floor(r.height / stride);
  if (w < 8 || h < 8) return fallback;
  const n = w * h;
  const half = stride >> 1;

  const gray = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y * stride + half) * r.width + (x * stride + half)) * 4;
      gray[y * w + x] = (r.data[i]! * 77 + r.data[i + 1]! * 150 + r.data[i + 2]! * 29) >> 8;
    }
  }
  const blurred = boxBlur(boxBlur(gray, w, h, 2), w, h, 2);
  const t = otsu(blurred);

  const bright = new Uint8Array(n);
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (blurred[i]! > t) {
      bright[i] = 1;
      count++;
    }
  }
  if (count < n * 0.02 || count > n * 0.95) return fallback;

  // Label 4-connected bright regions with an explicit stack.
  const labels = new Int32Array(n);
  const sizes: number[] = [0];
  const stack = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    if (!bright[i] || labels[i]) continue;
    const id = sizes.length;
    sizes.push(0);
    let sp = 0;
    stack[sp++] = i;
    labels[i] = id;
    while (sp > 0) {
      const p = stack[--sp]!;
      sizes[id]!++;
      const x = p % w;
      const y = (p - x) / w;
      const visit = (q: number) => {
        if (bright[q] && !labels[q]) {
          labels[q] = id;
          stack[sp++] = q;
        }
      };
      if (x > 0) visit(p - 1);
      if (x < w - 1) visit(p + 1);
      if (y > 0) visit(p - w);
      if (y < h - 1) visit(p + w);
    }
  }
  let best = 1;
  for (let id = 1; id < sizes.length; id++) if (sizes[id]! > sizes[best]!) best = id;
  if (sizes[best]! < n * MIN_AREA) return fallback;

  let tl = { v: Infinity, x: 0, y: 0 };
  let tr = { v: -Infinity, x: 0, y: 0 };
  let br = { v: -Infinity, x: 0, y: 0 };
  let bl = { v: Infinity, x: 0, y: 0 };
  for (let i = 0; i < n; i++) {
    if (labels[i] !== best) continue;
    const x = i % w;
    const y = (i - x) / w;
    const s = x + y;
    const d = x - y;
    if (s < tl.v) tl = { v: s, x, y };
    if (d > tr.v) tr = { v: d, x, y };
    if (s > br.v) br = { v: s, x, y };
    if (d < bl.v) bl = { v: d, x, y };
  }
  const norm = (p: { x: number; y: number }): Pt => ({
    x: Math.min(1, Math.max(0, (p.x * stride + half) / r.width)),
    y: Math.min(1, Math.max(0, (p.y * stride + half) / r.height)),
  });
  const quad: Quad = [norm(tl), norm(tr), norm(br), norm(bl)];
  if (shoelace(quad) < 0.1) return fallback;
  return { quad, detected: true };
}

export function shoelace(q: Quad): number {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % 4]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Separable box blur with clamped edges. */
function boxBlur(src: Uint8Array, w: number, h: number, rad: number): Uint8Array {
  const tmp = new Float32Array(w * h);
  const out = new Uint8Array(w * h);
  const k = 2 * rad + 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let d = -rad; d <= rad; d++) s += src[y * w + Math.min(w - 1, Math.max(0, x + d))]!;
      tmp[y * w + x] = s / k;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let d = -rad; d <= rad; d++) s += tmp[Math.min(h - 1, Math.max(0, y + d)) * w + x]!;
      out[y * w + x] = Math.round(s / k);
    }
  }
  return out;
}

function otsu(g: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  let sumAll = 0;
  for (const v of g) {
    hist[v]!++;
    sumAll += v;
  }
  const total = g.length;
  let wB = 0;
  let sumB = 0;
  let best = -1;
  let t = 128;
  for (let k = 0; k < 256; k++) {
    wB += hist[k]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += k * hist[k]!;
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      t = k;
    }
  }
  return t;
}
