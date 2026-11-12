// Pure matte math for Cutout. No DOM, no workers: unit-tested in matte.test.ts.
// A matte is a Uint8Array of alpha values (0 = background, 255 = subject), row-major, one byte per pixel.

export type Rect = { x: number; y: number; w: number; h: number };

/** RGBA pixels -> float32 NCHW tensor data: (v / 255 - mean[c]) / std[c]. */
export function toNchw(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, mean: readonly number[], std: readonly number[]): Float32Array {
  const n = w * h;
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) out[c * n + i] = (rgba[i * 4 + c]! / 255 - mean[c]!) / std[c]!;
  }
  return out;
}

/** Model output in 0..1 -> alpha bytes. Values outside 0..1 are clamped. */
export function toMatte(prob: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(prob.length);
  for (let i = 0; i < prob.length; i++) out[i] = Math.round(Math.min(1, Math.max(0, prob[i]!)) * 255);
  return out;
}

/** Alpha-only RGBA pixels (black, alpha = matte) for drawing a matte with destination-in. */
export function matteToRgba(m: Uint8Array): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(m.length * 4);
  for (let i = 0; i < m.length; i++) out[i * 4 + 3] = m[i]!;
  return out;
}

/** Bilinear resize with pixel-centre alignment (matches canvas/half-pixel convention). */
export function resizeBilinear(src: Uint8Array, sw: number, sh: number, dw: number, dh: number): Uint8Array {
  const out = new Uint8Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    const fy = Math.min(sh - 1, Math.max(0, ((y + 0.5) * sh) / dh - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = Math.min(sw - 1, Math.max(0, ((x + 0.5) * sw) / dw - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const wx = fx - x0;
      const top = src[y0 * sw + x0]! * (1 - wx) + src[y0 * sw + x1]! * wx;
      const bot = src[y1 * sw + x0]! * (1 - wx) + src[y1 * sw + x1]! * wx;
      out[y * dw + x] = Math.round(top * (1 - wy) + bot * wy);
    }
  }
  return out;
}

/** Edit-matte size: original aspect, longest side at most `max`, never enlarged. */
export function editSize(w: number, h: number, max = 1024): { w: number; h: number } {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/**
 * Edge threshold t (0..254): alpha <= t becomes 0, the rest is stretched from (t, 255] to (0, 255].
 * Removes faint haze around the subject. t = 0 leaves the matte unchanged.
 */
export function applyThreshold(m: Uint8Array, t: number): Uint8Array {
  if (t <= 0) return m.slice();
  const out = new Uint8Array(m.length);
  const span = 255 - t;
  for (let i = 0; i < m.length; i++) out[i] = m[i]! <= t ? 0 : Math.round(((m[i]! - t) * 255) / span);
  return out;
}

/** Feather: two passes of a separable box blur of radius r (approximately a tent filter). r = 0 is a copy. */
export function feather(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  let cur: Uint8Array = m.slice();
  if (r <= 0) return cur;
  for (let pass = 0; pass < 2; pass++) cur = boxV(boxH(cur, w, h, r), w, h, r);
  return cur;
}
function boxH(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += m[row + Math.min(w - 1, Math.max(0, x))]!;
    for (let x = 0; x < w; x++) {
      out[row + x] = Math.round(sum / (2 * r + 1));
      sum += m[row + Math.min(w - 1, x + r + 1)]! - m[row + Math.max(0, x - r)]!;
    }
  }
  return out;
}
function boxV(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(m.length);
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += m[Math.min(h - 1, Math.max(0, y)) * w + x]!;
    for (let y = 0; y < h; y++) {
      out[y * w + x] = Math.round(sum / (2 * r + 1));
      sum += m[Math.min(h - 1, y + r + 1) * w + x]! - m[Math.max(0, y - r) * w + x]!;
    }
  }
  return out;
}

/** Threshold, then feather. Never mutates the input. */
export function refine(m: Uint8Array, w: number, h: number, threshold: number, featherRadius: number): Uint8Array {
  return feather(applyThreshold(m, threshold), w, h, featherRadius);
}

/** Clip a rect to the matte; null when nothing is left. Fractions are rounded outward. */
export function clipRect(r: Rect, w: number, h: number): Rect | null {
  const x0 = Math.max(0, Math.floor(r.x));
  const y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(w, Math.ceil(r.x + r.w));
  const y1 = Math.min(h, Math.ceil(r.y + r.h));
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** Set every pixel inside the rect to `value` (0 = erase, 255 = restore). Mutates; returns the touched rect. */
export function fillRect(m: Uint8Array, w: number, h: number, r: Rect, value: number): Rect | null {
  const c = clipRect(r, w, h);
  if (!c) return null;
  for (let y = c.y; y < c.y + c.h; y++) m.fill(value, y * w + c.x, y * w + c.x + c.w);
  return c;
}

/** Hard round brush dab at (cx, cy). Mutates; returns the bounding rect that may have changed. */
export function paintDab(m: Uint8Array, w: number, h: number, cx: number, cy: number, radius: number, value: number): Rect | null {
  const c = clipRect({ x: cx - radius, y: cy - radius, w: radius * 2, h: radius * 2 }, w, h);
  if (!c) return null;
  const r2 = radius * radius;
  for (let y = c.y; y < c.y + c.h; y++) {
    for (let x = c.x; x < c.x + c.w; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) m[y * w + x] = value;
    }
  }
  return c;
}

/** Dabs along a segment so fast pointer moves leave no gaps. */
export function paintLine(m: Uint8Array, w: number, h: number, ax: number, ay: number, bx: number, by: number, radius: number, value: number): Rect | null {
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / Math.max(1, radius / 2)));
  let u: Rect | null = null;
  for (let i = 0; i <= steps; i++) u = union(u, paintDab(m, w, h, ax + ((bx - ax) * i) / steps, ay + ((by - ay) * i) / steps, radius, value));
  return u;
}

export function union(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function readRect(m: Uint8Array, w: number, r: Rect): Uint8Array {
  const out = new Uint8Array(r.w * r.h);
  for (let y = 0; y < r.h; y++) out.set(m.subarray((r.y + y) * w + r.x, (r.y + y) * w + r.x + r.w), y * r.w);
  return out;
}
export function writeRect(m: Uint8Array, w: number, r: Rect, data: Uint8Array) {
  for (let y = 0; y < r.h; y++) m.set(data.subarray(y * r.w, (y + 1) * r.w), (r.y + y) * w + r.x);
}

/**
 * Bounded undo/redo of matte edits, stored as diffs: each step keeps only the changed rectangle's
 * bytes before and after, not a copy of the whole matte. At most `limit` steps; the oldest is dropped.
 */
export type Patch = { rect: Rect; before: Uint8Array; after: Uint8Array };
export class MatteHistory {
  private done: Patch[] = [];
  private undone: Patch[] = [];
  constructor(private limit = 20) {}
  /** Record an edit already applied to `m`; `before` is the full matte as it was before the edit. */
  record(m: Uint8Array, w: number, before: Uint8Array, rect: Rect | null) {
    if (!rect) return;
    this.done.push({ rect, before: readRect(before, w, rect), after: readRect(m, w, rect) });
    if (this.done.length > this.limit) this.done.shift();
    this.undone = [];
  }
  undo(m: Uint8Array, w: number): boolean {
    const p = this.done.pop();
    if (!p) return false;
    writeRect(m, w, p.rect, p.before);
    this.undone.push(p);
    return true;
  }
  redo(m: Uint8Array, w: number): boolean {
    const p = this.undone.pop();
    if (!p) return false;
    writeRect(m, w, p.rect, p.after);
    this.done.push(p);
    return true;
  }
  get canUndo() {
    return this.done.length > 0;
  }
  get canRedo() {
    return this.undone.length > 0;
  }
  get size() {
    return this.done.length;
  }
}

export const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export function isPng(b: Uint8Array): boolean {
  return b.length >= 8 && PNG_MAGIC.every((v, i) => b[i] === v);
}
