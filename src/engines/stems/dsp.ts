// Pure DSP for the Spleeter 4-stem model: STFT / iSTFT, soft masks and segment cross-fading.
// The ONNX graph takes magnitudes [channels, splits, 512 frames, 1024 bins] and returns magnitudes;
// everything else (transform, mask, phase, reconstruction) happens here. No DOM, no ORT.
// Contract documented in public/models/spleeter-4stems/NOTICE.md and docs/audits/stems-feasibility.md.

export const N_FFT = 4096;
export const HOP = 1024;
export const BINS = N_FFT / 2 + 1; // 2049
export const F = 1024; // bins the network models (up to ~11 kHz)
export const T = 512; // frames per network input
/** Zeros in front of every transformed segment so a periodic Hann overlap-add inverts exactly. */
export const PAD = N_FFT - HOP;
/** Most samples one network call can cover: T frames, minus the front pad. */
export const MAX_SEGMENT = T * HOP - PAD;
const EPS = 1e-10;

/** Periodic Hann window (NOT symmetric): this is what the model was trained against. */
export function periodicHann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

/** In-place radix-2 complex FFT with precomputed tables. Inverse is scaled by 1/n. */
export class Fft {
  readonly n: number;
  private cos: Float64Array;
  private sin: Float64Array;
  private rev: Uint32Array;
  constructor(n: number) {
    if (n < 2 || (n & (n - 1)) !== 0) throw new Error('FFT size must be a power of two');
    this.n = n;
    this.cos = new Float64Array(n / 2);
    this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / n);
      this.sin[i] = Math.sin((2 * Math.PI * i) / n);
    }
    this.rev = new Uint32Array(n);
    const bits = Math.log2(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
  }
  transform(re: Float64Array, im: Float64Array, inverse: boolean): void {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const j = this.rev[i]!;
      if (j > i) {
        const tr = re[i]!;
        re[i] = re[j]!;
        re[j] = tr;
        const ti = im[i]!;
        im[i] = im[j]!;
        im[j] = ti;
      }
    }
    const sgn = inverse ? 1 : -1;
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let start = 0; start < n; start += size) {
        for (let k = 0; k < half; k++) {
          const wr = this.cos[k * step]!;
          const wi = sgn * this.sin[k * step]!;
          const a = start + k;
          const b = a + half;
          const xr = re[b]! * wr - im[b]! * wi;
          const xi = re[b]! * wi + im[b]! * wr;
          re[b] = re[a]! - xr;
          im[b] = im[a]! - xi;
          re[a]! += xr;
          im[a]! += xi;
        }
      }
    }
    if (inverse) for (let i = 0; i < n; i++) {
      re[i]! /= n;
      im[i]! /= n;
    }
  }
}

export type Spectrum = { re: Float32Array; im: Float32Array; frames: number };

/** Number of STFT frames for a segment of `length` samples (front pad included). */
export const frameCount = (length: number): number => Math.ceil((PAD + length) / HOP);

/** Frames x BINS, row-major. Throws when the segment needs more than T frames. */
export function stft(x: Float32Array, fft: Fft, win: Float32Array): Spectrum {
  const frames = frameCount(x.length);
  if (frames > T) throw new Error(`segment of ${x.length} samples needs ${frames} frames (max ${T})`);
  const re = new Float32Array(frames * BINS);
  const im = new Float32Array(frames * BINS);
  const br = new Float64Array(N_FFT);
  const bi = new Float64Array(N_FFT);
  for (let f = 0; f < frames; f++) {
    const base = f * HOP - PAD; // index into x of this frame's first sample
    for (let i = 0; i < N_FFT; i++) {
      const s = base + i;
      br[i] = s >= 0 && s < x.length ? x[s]! * win[i]! : 0;
      bi[i] = 0;
    }
    fft.transform(br, bi, false);
    const o = f * BINS;
    for (let k = 0; k < BINS; k++) {
      re[o + k] = br[k]!;
      im[o + k] = bi[k]!;
    }
  }
  return { re, im, frames };
}

/** Weighted overlap-add inverse of stft(): exact for an unmodified spectrum, no extra constants. */
export function istft(spec: Spectrum, length: number, fft: Fft, win: Float32Array): Float32Array {
  const total = (spec.frames - 1) * HOP + N_FFT;
  const out = new Float64Array(total);
  const wsum = new Float64Array(total);
  const br = new Float64Array(N_FFT);
  const bi = new Float64Array(N_FFT);
  for (let f = 0; f < spec.frames; f++) {
    const o = f * BINS;
    for (let k = 0; k < BINS; k++) {
      br[k] = spec.re[o + k]!;
      bi[k] = spec.im[o + k]!;
    }
    for (let k = 1; k < N_FFT / 2; k++) {
      br[N_FFT - k] = br[k]!;
      bi[N_FFT - k] = -bi[k]!;
    }
    fft.transform(br, bi, true);
    const at = f * HOP;
    for (let i = 0; i < N_FFT; i++) {
      out[at + i]! += br[i]! * win[i]!;
      wsum[at + i]! += win[i]! * win[i]!;
    }
  }
  const y = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const w = wsum[PAD + i]!;
    y[i] = w > 1e-8 ? out[PAD + i]! / w : 0;
  }
  return y;
}

/** Magnitudes of the first F bins as the network input layout [frame][bin], zero padded to T frames. */
export function magnitudes(spec: Spectrum, out: Float32Array, offset: number): void {
  for (let f = 0; f < spec.frames; f++) {
    const s = f * BINS;
    const d = offset + f * F;
    for (let k = 0; k < F; k++) out[d + k] = Math.hypot(spec.re[s + k]!, spec.im[s + k]!);
  }
}

/**
 * Spleeter's soft ratio mask across all stems, in place on `est` (each [T*F], network layout):
 * mask_s = (e_s^2 + eps/n) / (sum e^2 + eps). Only the first `frames` rows are meaningful.
 */
export function ratioMasks(est: Float32Array[], frames: number): void {
  const n = est.length;
  const used = frames * F;
  for (let i = 0; i < used; i++) {
    let sum = EPS;
    for (let s = 0; s < n; s++) sum += est[s]![i]! * est[s]![i]!;
    for (let s = 0; s < n; s++) est[s]![i] = (est[s]![i]! * est[s]![i]! + EPS / n) / sum;
  }
}

/**
 * Applies a [frames x F] mask to the complex spectrum. Bins above F get the per-frame mean of the
 * mask ("average" extension; Spleeter's default "zeros" would delete everything above ~11 kHz).
 */
export function applyMask(spec: Spectrum, mask: Float32Array, maskOffset: number): Spectrum {
  const re = new Float32Array(spec.re.length);
  const im = new Float32Array(spec.im.length);
  for (let f = 0; f < spec.frames; f++) {
    let mean = 0;
    const m = maskOffset + f * F;
    for (let k = 0; k < F; k++) mean += mask[m + k]!;
    mean /= F;
    const o = f * BINS;
    for (let k = 0; k < BINS; k++) {
      const g = k < F ? mask[m + k]! : mean;
      re[o + k] = spec.re[o + k]! * g;
      im[o + k] = spec.im[o + k]! * g;
    }
  }
  return { re, im, frames: spec.frames };
}

export type Segment = { start: number; end: number };

/**
 * Overlapping segments covering [0, total). Neighbours share exactly `overlap` samples that are
 * cross-faded. Every segment after the first is longer than `overlap`, because a segment only exists
 * when the previous one ended before `total`.
 */
export function planSegments(total: number, segment: number, overlap: number): Segment[] {
  if (segment > MAX_SEGMENT) throw new Error('segment longer than one network call');
  if (overlap < 0 || overlap * 2 > segment) throw new Error('overlap must be at most half the segment');
  const hop = segment - overlap;
  const out: Segment[] = [];
  for (let start = 0; ; start += hop) {
    const end = Math.min(total, start + segment);
    out.push({ start, end });
    if (end >= total) break;
  }
  return out;
}

/** Gain for sample i (0-based) of a segment: raised-cosine fade over the shared overlap, 1 elsewhere. */
export function fadeGain(i: number, len: number, fadeIn: number, fadeOut: number): number {
  let g = 1;
  if (fadeIn > 0 && i < fadeIn) g *= 0.5 - 0.5 * Math.cos((Math.PI * (i + 0.5)) / fadeIn);
  const j = len - 1 - i;
  if (fadeOut > 0 && j < fadeOut) g *= 0.5 - 0.5 * Math.cos((Math.PI * (j + 0.5)) / fadeOut);
  return g;
}

/** Adds `seg` (already separated audio for [start, end)) into `acc`, faded by its overlaps. */
export function overlapAdd(acc: Float32Array, seg: Float32Array, start: number, fadeIn: number, fadeOut: number): void {
  for (let i = 0; i < seg.length; i++) acc[start + i]! += seg[i]! * fadeGain(i, seg.length, fadeIn, fadeOut);
}

/** Pearson correlation; used by tests and the e2e check. */
export function correlation(a: Float32Array, b: Float32Array): number {
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < a.length; i++) {
    ma += a[i]!;
    mb += b[i]!;
  }
  ma /= a.length;
  mb /= a.length;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]! - ma;
    const y = b[i]! - mb;
    sab += x * y;
    saa += x * x;
    sbb += y * y;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}
