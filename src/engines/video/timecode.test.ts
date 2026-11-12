import { describe, expect, it } from 'vitest';
import { formatTimecode, parseTimecode, resolveTrim } from './timecode';

describe('parseTimecode', () => {
  it('parses mm:ss.mmm, hh:mm:ss and plain seconds', () => {
    expect(parseTimecode('01:23.450')).toEqual({ ok: true, seconds: 83.45 });
    expect(parseTimecode(' 0:01.5 ')).toEqual({ ok: true, seconds: 1.5 });
    expect(parseTimecode('1:02:03.004')).toEqual({ ok: true, seconds: 3723.004 });
    expect(parseTimecode('83.45')).toEqual({ ok: true, seconds: 83.45 });
  });

  it('rejects empty, negative, malformed and out-of-range parts', () => {
    for (const bad of ['', '   ', '-1', 'abc', '1:2:3:4', '1:60', '1:75.000', '1.2345', '1,5', '1e3']) {
      expect(parseTimecode(bad).ok, bad).toBe(false);
    }
  });
});

describe('formatTimecode', () => {
  it('formats to mm:ss.mmm and rounds to the millisecond', () => {
    expect(formatTimecode(83.45)).toBe('01:23.450');
    expect(formatTimecode(0)).toBe('00:00.000');
    expect(formatTimecode(1.0004)).toBe('00:01.000');
    expect(formatTimecode(3599.9996)).toBe('60:00.000');
  });

  it('round-trips through parseTimecode', () => {
    for (const s of [0, 0.001, 12.345, 75.5, 600.25]) {
      expect(parseTimecode(formatTimecode(s))).toEqual({ ok: true, seconds: s });
    }
  });
});

describe('resolveTrim', () => {
  it('uses 0 and the full duration when fields are empty', () => {
    expect(resolveTrim('', '', 4)).toEqual({ ok: true, start: 0, end: 4 });
  });

  it('accepts a valid range inside the duration', () => {
    expect(resolveTrim('01.000', '03.000', 4)).toEqual({ ok: true, start: 1, end: 3 });
  });

  it('reports the field that is wrong', () => {
    const endBeforeStart = resolveTrim('3', '1', 4);
    expect(endBeforeStart).toMatchObject({ ok: false, field: 'end', error: 'End must be later than start.' });
    const pastEnd = resolveTrim('0', '5', 4);
    expect(pastEnd).toMatchObject({ ok: false, field: 'end' });
    expect(pastEnd.ok ? '' : pastEnd.error).toContain('00:04.000');
    const startAtEnd = resolveTrim('4', '', 4);
    expect(startAtEnd).toMatchObject({ ok: false, field: 'start' });
    const badText = resolveTrim('x', '', 4);
    expect(badText).toMatchObject({ ok: false, field: 'start' });
    expect(resolveTrim('', 'y', 4)).toMatchObject({ ok: false, field: 'end' });
  });
});
