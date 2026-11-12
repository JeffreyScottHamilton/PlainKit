import { describe, expect, it } from 'vitest';
import { ToolError } from '@/lib/errors';
import { encodeWav16, parseWav, trimRange } from './wav';

const sine = (n: number, sr: number, hz: number, amp = 1) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / sr));
const sample = (bytes: Uint8Array, index: number) => new DataView(bytes.buffer, bytes.byteOffset).getInt16(44 + index * 2, true);
const str = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));

describe('encodeWav16 header', () => {
  it('writes a correct RIFF header for mono 48 kHz', () => {
    const b = encodeWav16([sine(100, 48000, 440)], 48000);
    expect(b.length).toBe(44 + 200);
    expect(str(b, 0, 4)).toBe('RIFF');
    expect(new DataView(b.buffer).getUint32(4, true)).toBe(36 + 200);
    expect(str(b, 8, 4)).toBe('WAVE');
    expect(str(b, 12, 4)).toBe('fmt ');
    const v = new DataView(b.buffer);
    expect(v.getUint16(20, true)).toBe(1);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint32(28, true)).toBe(96000);
    expect(v.getUint16(32, true)).toBe(2);
    expect(v.getUint16(34, true)).toBe(16);
    expect(str(b, 36, 4)).toBe('data');
    expect(v.getUint32(40, true)).toBe(200);
  });
});

describe('sample values', () => {
  it('matches a known sine at the expected 16-bit values', () => {
    const b = encodeWav16([sine(48, 48000, 1000, 1)], 48000);
    expect(sample(b, 0)).toBe(0);
    const peak = Math.round(Math.sin((2 * Math.PI * 1000 * 12) / 48000) * 32767);
    expect(sample(b, 12)).toBe(peak);
  });
  it('clamps values outside -1..1 and maps -1 to -32768', () => {
    const b = encodeWav16([Float32Array.from([2, -2, 1, -1, 0.5])], 8000);
    expect([0, 1, 2, 3, 4].map((i) => sample(b, i))).toEqual([32767, -32768, 32767, -32768, 16384]);
  });
  it('interleaves stereo frames left then right', () => {
    const b = encodeWav16([Float32Array.from([0.5, 0.25]), Float32Array.from([-0.5, -0.25])], 44100);
    expect([sample(b, 0), sample(b, 1), sample(b, 2), sample(b, 3)]).toEqual([16384, -16384, 8192, -8192]);
    expect(new DataView(b.buffer).getUint16(22, true)).toBe(2);
  });
  it('is not dithered by default and is when asked', () => {
    const x = [Float32Array.from({ length: 50 }, () => 0.1234)];
    const plain = encodeWav16(x, 8000);
    const again = encodeWav16(x, 8000);
    expect(plain).toEqual(again);
    const dithered = encodeWav16(x, 8000, { dither: true, random: () => 0.9 });
    expect(sample(dithered, 0)).not.toBe(sample(plain, 0));
  });
  it('refuses mismatched channel lengths', () => {
    expect(() => encodeWav16([new Float32Array(2), new Float32Array(3)], 8000)).toThrow();
  });
});

describe('parseWav', () => {
  it('round-trips the header of an encoded file', () => {
    const frames = 4410;
    const b = encodeWav16([sine(frames, 44100, 440, 0.5), sine(frames, 44100, 440, 0.25)], 44100);
    const info = parseWav(b);
    expect(info).toMatchObject({ sampleRate: 44100, channels: 2, bitsPerSample: 16, blockAlign: 4, dataOffset: 44, dataBytes: frames * 4, frames });
    expect(info.durationSec).toBeCloseTo(0.1, 6);
  });
  it('rejects non-WAV and non-16-bit input', () => {
    expect(() => parseWav(new TextEncoder().encode('hello world, not audio'))).toThrow();
    const b = encodeWav16([new Float32Array(4)], 8000);
    new DataView(b.buffer).setUint16(34, 8, true);
    expect(() => parseWav(b)).toThrow(/bit depth/);
  });
});

describe('trimRange', () => {
  it('returns the whole range when no trim is given', () => {
    expect(trimRange(48000, 48000)).toEqual({ start: 0, end: 48000 });
  });
  it('converts seconds to frames at the decoded rate', () => {
    expect(trimRange(96000, 48000, 0.5, 1.5)).toEqual({ start: 24000, end: 72000 });
  });
  it('clips an end past the audio and refuses bad times', () => {
    expect(trimRange(48000, 48000, 0, 10)).toEqual({ start: 0, end: 48000 });
    expect(() => trimRange(48000, 48000, 1, 0.5)).toThrow(ToolError);
    expect(() => trimRange(48000, 48000, -1)).toThrow(ToolError);
    expect(() => trimRange(48000, 48000, Number.NaN)).toThrow(ToolError);
    expect(() => trimRange(48000, 48000, 1)).toThrow(ToolError);
  });
});
