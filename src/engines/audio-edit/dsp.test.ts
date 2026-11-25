import { describe, expect, it } from 'vitest';
import { ToolError } from '@/lib/errors';
import { editClip, formatTime, parseTime, peakOf, selectRange, silenceEdges, toLayout, type EditOptions, dbToGain } from './dsp';

const NONE: EditOptions = { fadeInSec: 0, fadeOutSec: 0, gainDb: 0, normalize: false, removeSilence: false, silenceDb: -50, mono: false };
const sine = (n: number, sr: number, amp = 0.5, hz = 440) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / sr));
const ones = (n: number) => Float32Array.from({ length: n }, () => 1);
const dbfs = (x: number) => 20 * Math.log10(x);

describe('selectRange', () => {
  it('returns copies of the requested seconds', () => {
    const src = [Float32Array.from({ length: 100 }, (_, i) => i / 100)];
    const out = selectRange(src, 10, 1, 3);
    expect(out[0]!.length).toBe(20);
    expect(out[0]![0]).toBeCloseTo(0.1, 6);
    out[0]![0] = 9;
    expect(src[0]![10]).toBeCloseTo(0.1, 6);
  });
  it('throws a ToolError for a range outside the audio', () => {
    expect(() => selectRange([new Float32Array(10)], 10, 2, 1)).toThrow(ToolError);
  });
});

describe('silenceEdges', () => {
  it('finds the first and last frame above the threshold', () => {
    const x = new Float32Array(100);
    x.set([0.5, 0.5], 40);
    x.set([0.5], 60);
    expect(silenceEdges([x], -20)).toEqual({ start: 40, end: 61 });
  });
  it('returns null when nothing is above the threshold', () => {
    expect(silenceEdges([new Float32Array(50)], -50)).toBeNull();
  });
  it('treats a quiet signal below the threshold as silence', () => {
    expect(silenceEdges([new Float32Array(50).fill(0.001)], -40)).toBeNull();
  });
});

describe('toLayout', () => {
  it('averages channels to mono', () => {
    const [m] = toLayout([Float32Array.from([1, 0]), Float32Array.from([0, 1])], true);
    expect(Array.from(m!)).toEqual([0.5, 0.5]);
  });
  it('duplicates mono into stereo and folds surround into left and right', () => {
    const [a, b] = toLayout([Float32Array.from([0.3])], false);
    expect(a![0]).toBeCloseTo(0.3, 6);
    expect(b![0]).toBeCloseTo(0.3, 6);
    const [l, r] = toLayout([ones(4), Float32Array.from({ length: 4 }, () => 0), ones(4), Float32Array.from({ length: 4 }, () => 0)], false);
    expect(Array.from(l!)).toEqual([1, 1, 1, 1]);
    expect(Array.from(r!)).toEqual([0, 0, 0, 0]);
  });
});

describe('editClip', () => {
  it('normalizes the peak to -1 dBFS', () => {
    const { channels, warnings } = editClip([sine(4800, 48000, 0.2)], 48000, { ...NONE, normalize: true });
    expect(dbfs(peakOf(channels))).toBeCloseTo(-1, 3);
    expect(warnings).toEqual([]);
  });
  it('warns and leaves silence alone when normalizing a silent clip', () => {
    const r = editClip([new Float32Array(10)], 48000, { ...NONE, normalize: true });
    expect(peakOf(r.channels)).toBe(0);
    expect(r.warnings[0]).toMatch(/Normalize skipped/);
  });
  it('applies gain in dB', () => {
    const { channels } = editClip([Float32Array.from([0.1])], 48000, { ...NONE, gainDb: -6 });
    expect(channels[0]![0]).toBeCloseTo(0.1 * dbToGain(-6), 6);
  });
  it('clamps and reports clipping after gain', () => {
    const r = editClip([Float32Array.from([0.9, -0.9, 0.1])], 48000, { ...NONE, gainDb: 6, mono: true });
    expect(Array.from(r.channels[0]!)).toEqual([1, -1, expect.closeTo(0.1 * dbToGain(6), 5)]);
    expect(r.warnings[0]).toMatch(/2 samples were clipped/);
  });
  it('fades in and out linearly', () => {
    const { channels } = editClip([ones(10)], 10, { ...NONE, fadeInSec: 0.4, fadeOutSec: 0.2 });
    const c = channels[0]!;
    expect(c[0]).toBe(0);
    expect(c[2]).toBeCloseTo(0.5, 6);
    expect(c[4]).toBe(1);
    expect(c[8]).toBeCloseTo(0.5, 6);
    expect(c[9]).toBe(0);
  });
  it('shortens overlapping fades so they fit the clip', () => {
    const { channels } = editClip([ones(10)], 10, { ...NONE, fadeInSec: 1, fadeOutSec: 1 });
    expect(channels[0]!.length).toBe(10);
    expect(channels[0]!.every((x) => x >= 0 && x <= 1)).toBe(true);
  });
  it('removes silence at both ends and keeps the middle', () => {
    const x = new Float32Array(100);
    x.set(new Float32Array(40).fill(0.5), 30);
    const { channels } = editClip([x], 1000, { ...NONE, removeSilence: true, silenceDb: -30 });
    expect(channels[0]!.length).toBe(40);
  });
  it('fails with a ToolError when the whole selection is silent', () => {
    expect(() => editClip([new Float32Array(100)], 1000, { ...NONE, removeSilence: true })).toThrow(ToolError);
  });
  it('does not mutate the input channels', () => {
    const input = [sine(1000, 1000)];
    const before = Array.from(input[0]!);
    editClip(input, 1000, { ...NONE, gainDb: 10, normalize: true, fadeInSec: 0.1, mono: true });
    expect(Array.from(input[0]!)).toEqual(before);
  });
});

describe('parseTime and formatTime', () => {
  it('parses mm:ss.s, m:ss and plain seconds', () => {
    expect(parseTime('00:01.5')).toBe(1.5);
    expect(parseTime('1:30')).toBe(90);
    expect(parseTime('2.25')).toBe(2.25);
  });
  it('rejects malformed or out-of-range values', () => {
    expect(parseTime('abc')).toBeNull();
    expect(parseTime('1:75')).toBeNull();
    expect(parseTime('')).toBeNull();
    expect(parseTime('-1')).toBeNull();
  });
  it('formats to tenths', () => {
    expect(formatTime(0)).toBe('00:00.0');
    expect(formatTime(65.04)).toBe('01:05.0');
    expect(formatTime(3.27)).toBe('00:03.3');
  });
});
