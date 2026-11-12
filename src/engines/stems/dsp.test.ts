import { describe, expect, it } from 'vitest';
import { parseWav } from '@/engines/audio/wav';
import { applyMask, BINS, correlation, F, Fft, fadeGain, istft, magnitudes, mixSegment, MAX_SEGMENT, N_FFT, overlapAdd, periodicHann, planSegments, ratioMasks, stft, T } from './dsp';
import { allocWav, writeFrames } from './wavstream';

const win = periodicHann(N_FFT);
const fft = new Fft(N_FFT);
function noise(n: number, seed = 1): Float32Array {
  let s = seed;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = Math.sin(i * 0.05) * 0.5 + (((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) - 0.5) * 0.4;
  return x;
}

describe('fft', () => {
  it('matches a naive DFT', () => {
    const f = new Fft(16);
    const re = Float64Array.from({ length: 16 }, (_, i) => Math.sin(i) + i / 7);
    const im = new Float64Array(16);
    const r0 = re.slice();
    f.transform(re, im, false);
    for (let k = 0; k < 16; k++) {
      let a = 0;
      let b = 0;
      for (let t = 0; t < 16; t++) {
        a += r0[t]! * Math.cos((2 * Math.PI * k * t) / 16);
        b -= r0[t]! * Math.sin((2 * Math.PI * k * t) / 16);
      }
      expect(re[k]).toBeCloseTo(a, 9);
      expect(im[k]).toBeCloseTo(b, 9);
    }
  });
  it('rejects non power of two', () => expect(() => new Fft(12)).toThrow());
});

describe('stft / istft', () => {
  it.each([1, 1000, 44100, MAX_SEGMENT])('iSTFT(STFT(x)) = x within 1e-4 for %i samples', (n) => {
    const x = noise(n);
    const y = istft(stft(x, fft, win), n, fft, win);
    let e = 0;
    for (let i = 0; i < n; i++) e = Math.max(e, Math.abs(y[i]! - x[i]!));
    expect(e).toBeLessThan(1e-4);
  });
  it('refuses a segment that needs more than T frames', () => expect(() => stft(new Float32Array(MAX_SEGMENT + 1), fft, win)).toThrow());
  it('network layout is T x F, zero padded', () => {
    const sp = stft(noise(44100), fft, win);
    const buf = new Float32Array(T * F);
    magnitudes(sp, buf, 0);
    expect(buf.slice(sp.frames * F).every((v) => v === 0)).toBe(true);
    expect(buf.slice(0, F).some((v) => v > 0)).toBe(true);
  });
});

describe('masks', () => {
  it('ratio masks sum to 1 and stems sum back to the input', () => {
    const x = noise(44100, 3);
    const sp = stft(x, fft, win);
    const est = [0, 1, 2, 3].map((k) => Float32Array.from({ length: T * F }, (_, i) => 0.1 + ((i * (k + 3)) % 17) / 5));
    ratioMasks(est, sp.frames);
    for (let i = 0; i < sp.frames * F; i += 97) expect(est.reduce((a, m) => a + m[i]!, 0)).toBeCloseTo(1, 5);
    const parts = est.map((m) => istft(applyMask(sp, m, 0), x.length, fft, win));
    let e = 0;
    for (let i = 0; i < x.length; i++) e = Math.max(e, Math.abs(parts.reduce((a, p) => a + p[i]!, 0) - x[i]!));
    expect(e).toBeLessThan(1e-4);
    expect(BINS).toBe(2049);
  });
});

describe('segments', () => {
  it('cover the whole signal with the stated overlap', () => {
    const plan = planSegments(1_000_000, 441_000, 44_100);
    expect(plan[0]!.start).toBe(0);
    expect(plan[plan.length - 1]!.end).toBe(1_000_000);
    for (let i = 1; i < plan.length; i++) expect(plan[i - 1]!.end - plan[i]!.start).toBe(44_100);
    expect(planSegments(1000, 441_000, 44_100)).toEqual([{ start: 0, end: 1000 }]);
  });
  it('fade gains of neighbours sum to 1', () => {
    for (const q of [0, 10, 500, 999]) expect(fadeGain(q, 5000, 1000, 0) + fadeGain(4000 + q, 5000, 0, 1000)).toBeCloseTo(1, 9);
  });
  it('a constant signal survives segmenting and cross-fading with no seam', () => {
    const total = 1_300_000;
    const OV = 20_000;
    const plan = planSegments(total, 500_000, OV);
    const acc = new Float32Array(total);
    plan.forEach((p, i) => overlapAdd(acc, new Float32Array(p.end - p.start).fill(0.5), p.start, i > 0 ? OV : 0, i < plan.length - 1 ? OV : 0));
    for (let i = 0; i < total; i += 997) expect(acc[i]).toBeCloseTo(0.5, 5);
  });
  it('streaming mixSegment equals overlapAdd', () => {
    const total = 120_000;
    const OV = 8000;
    const plan = planSegments(total, 50_000, OV);
    const src = noise(total, 9);
    const ref = new Float32Array(total);
    const got = new Float32Array(total);
    let carry: Float32Array | null = null;
    let at = 0;
    plan.forEach((p, i) => {
      const y = src.slice(p.start, p.end);
      const first = i === 0;
      const last = i === plan.length - 1;
      overlapAdd(ref, y, p.start, first ? 0 : OV, last ? 0 : OV);
      const m = mixSegment(y, carry, OV, first, last);
      carry = m.carry;
      got.set(m.final, at);
      at += m.final.length;
    });
    expect(at).toBe(total);
    for (let i = 0; i < total; i++) expect(Math.abs(got[i]! - ref[i]!)).toBeLessThan(1e-6);
    // a segmented identity is the source itself (fades sum to 1)
    expect(correlation(got, src)).toBeGreaterThan(0.99999);
  });
});

describe('wavstream', () => {
  it('writes a valid 16-bit WAV in place across several writes', () => {
    const wav = allocWav(6, 2, 44100);
    writeFrames(wav, 0, [Float32Array.of(0, 1, -1), Float32Array.of(0.5, 2, -0.5)]);
    writeFrames(wav, 3, [Float32Array.of(0.25, 0, 0), Float32Array.of(0, 0, 1)]);
    const info = parseWav(wav);
    expect(info).toMatchObject({ sampleRate: 44100, channels: 2, frames: 6, bitsPerSample: 16 });
    const v = new DataView(wav.buffer);
    expect(v.getInt16(44 + 2 * 2, true)).toBe(32767); // frame 1, left
    expect(v.getInt16(44 + 3 * 2, true)).toBe(32767); // frame 1, right clamped
    expect(v.getInt16(44 + 4 * 2, true)).toBe(-32768);
    expect(v.getInt16(44 + 6 * 2, true)).toBe(Math.round(0.25 * 32767));
  });
});
