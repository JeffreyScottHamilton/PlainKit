import { describe, expect, it } from 'vitest';
import { pickMime, baseType, extensionFor } from './mime';
import { recordingName, stamp } from './naming';
import { formatDuration, estimatePerMinute } from './duration';
import { modeSupport, type CapabilityEnv } from './support';
import { peakLevel } from './levels';

const all = () => true;
const none = () => false;
const only = (...types: string[]) => (t: string) => types.includes(t);

describe('pickMime', () => {
  it('prefers mp4/avc1 for video when supported', () => {
    expect(pickMime('video', all)).toBe('video/mp4;codecs=avc1');
  });
  it('falls through vp9, vp8, then plain webm', () => {
    expect(pickMime('video', only('video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'))).toBe('video/webm;codecs=vp9,opus');
    expect(pickMime('video', only('video/webm;codecs=vp8,opus', 'video/webm'))).toBe('video/webm;codecs=vp8,opus');
    expect(pickMime('video', only('video/webm'))).toBe('video/webm');
  });
  it('prefers audio/mp4 over webm/opus for audio', () => {
    expect(pickMime('audio', all)).toBe('audio/mp4');
    expect(pickMime('audio', only('audio/webm;codecs=opus'))).toBe('audio/webm;codecs=opus');
  });
  it('returns null when nothing is supported, so the browser default is used', () => {
    expect(pickMime('video', none)).toBeNull();
    expect(pickMime('audio', none)).toBeNull();
  });
});

describe('baseType and extensionFor', () => {
  it('strips codec parameters', () => {
    expect(baseType('video/webm;codecs=vp9,opus')).toBe('video/webm');
  });
  it('maps recorded types to file extensions', () => {
    expect(extensionFor('video/mp4;codecs=avc1')).toBe('mp4');
    expect(extensionFor('video/webm;codecs=vp8,opus')).toBe('webm');
    expect(extensionFor('audio/mp4')).toBe('m4a');
    expect(extensionFor('audio/webm;codecs=opus')).toBe('webm');
  });
  it('falls back to webm for unknown types', () => {
    expect(extensionFor('')).toBe('webm');
    expect(extensionFor('application/x-odd')).toBe('webm');
  });
});

describe('naming', () => {
  const when = new Date(2026, 10, 25, 19, 2, 40); // local time, so the test holds in any zone
  it('builds a dated, filename-safe stamp in local time', () => {
    expect(stamp(when)).toBe('2026-11-25 19-02');
  });
  it('names each kind', () => {
    expect(recordingName('screen', when, 'webm')).toBe('Screen recording 2026-11-25 19-02.webm');
    expect(recordingName('camera', when, 'mp4')).toBe('Camera recording 2026-11-25 19-02.mp4');
    expect(recordingName('voice', when, 'm4a')).toBe('Voice memo 2026-11-25 19-02.m4a');
  });
  it('never contains a path separator or a colon', () => {
    expect(recordingName('voice', when, 'webm')).not.toMatch(/[\\/:]/);
  });
});

describe('formatDuration', () => {
  it('formats m:ss and floors to whole seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(2999)).toBe('0:02');
    expect(formatDuration(65_000)).toBe('1:05');
  });
  it('switches to h:mm:ss from one hour', () => {
    expect(formatDuration(3_600_000)).toBe('1:00:00');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
  });
  it('clamps negative input to zero', () => {
    expect(formatDuration(-500)).toBe('0:00');
  });
});

describe('estimatePerMinute', () => {
  it('is null for the first two seconds', () => {
    expect(estimatePerMinute(1000, 1999)).toBeNull();
  });
  it('extrapolates bytes per minute', () => {
    expect(estimatePerMinute(1_000_000, 10_000)).toBe(6_000_000);
  });
});

describe('modeSupport', () => {
  const full: CapabilityEnv = { mediaRecorder: true, getDisplayMedia: true, getUserMedia: true };
  it('supports every mode on a desktop browser', () => {
    expect(modeSupport('screen', full)).toEqual({ ok: true });
    expect(modeSupport('camera', full)).toEqual({ ok: true });
    expect(modeSupport('voice', full)).toEqual({ ok: true });
  });
  it('marks screen unsupported without getDisplayMedia, with a reason', () => {
    const phone = { ...full, getDisplayMedia: false };
    const r = modeSupport('screen', phone);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/cannot share the screen/);
    expect(modeSupport('camera', phone)).toEqual({ ok: true });
  });
  it('marks camera and voice unsupported without getUserMedia', () => {
    const noMedia = { ...full, getUserMedia: false };
    expect(modeSupport('camera', noMedia).ok).toBe(false);
    expect(modeSupport('voice', noMedia).ok).toBe(false);
    expect(modeSupport('screen', noMedia)).toEqual({ ok: true });
  });
  it('marks every mode unsupported without MediaRecorder', () => {
    const none = { mediaRecorder: false, getDisplayMedia: true, getUserMedia: true };
    expect(modeSupport('voice', none).ok).toBe(false);
    expect(modeSupport('screen', none).ok).toBe(false);
  });
});

describe('peakLevel', () => {
  it('is 0 for silence and clamps to 1', () => {
    expect(peakLevel(new Float32Array([0, 0, 0]))).toBe(0);
    expect(peakLevel(new Float32Array([0.2, -0.7, 0.1]))).toBeCloseTo(0.7);
    expect(peakLevel(new Float32Array([1.5]))).toBe(1);
  });
});
