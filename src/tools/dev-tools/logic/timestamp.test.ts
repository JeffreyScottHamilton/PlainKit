import { describe, expect, it } from 'vitest';
import { isoToMs, localIso, parseTimestamp } from './timestamp';

describe('timestamp', () => {
  it('assumes seconds below 1e11 and milliseconds above', () => {
    const s = parseTimestamp('1767225600', 'auto');
    expect(s).toMatchObject({ ok: true, ms: 1767225600000 });
    if (s.ok) expect(s.assumed).toContain('seconds');
    const m = parseTimestamp('1767225600000', 'auto');
    expect(m).toMatchObject({ ok: true, ms: 1767225600000 });
    if (m.ok) expect(m.assumed).toContain('milliseconds');
  });
  it('parses ISO 8601 with and without zone', () => {
    expect(isoToMs('2026-01-01T00:00:00Z')).toMatchObject({ ok: true, ms: Date.UTC(2026, 0, 1) });
    expect(isoToMs('2026-01-01T02:00:00+02:00')).toMatchObject({ ok: true, ms: Date.UTC(2026, 0, 1) });
    expect(isoToMs('2026-01-01')).toMatchObject({ ok: true, ms: Date.UTC(2026, 0, 1) });
  });
  it('rejects days that do not exist', () => {
    expect(isoToMs('2026-02-30')).toEqual({ ok: false, message: 'That day does not exist in that month.' });
  });
  it('formats local time with an offset', () => {
    expect(localIso(0)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000[+-]\d{2}:\d{2}$/);
  });
});
