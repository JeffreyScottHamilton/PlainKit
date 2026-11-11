import { describe, expect, it } from 'vitest';
import { addToDate, diffDates, fmtYmd, parseDate } from './date-calc';

const ms = (s: string) => {
  const r = parseDate(s);
  if (!r.ok) throw new Error(r.error);
  return r.ms;
};

describe('date-calc', () => {
  it('counts days across a leap day and reports the y/m/d breakdown', () => {
    const r = diffDates(ms('2024-02-28'), ms('2024-03-01'), false);
    expect(r.days).toBe(2);
    expect(r.order).toBe('later');
    const long = diffDates(ms('2023-01-31'), ms('2024-03-01'), false);
    expect(long.ymd).toEqual({ y: 1, m: 1, d: 1 });
  });

  it('inclusive mode counts both endpoints', () => {
    expect(diffDates(ms('2025-01-01'), ms('2025-01-01'), true).days).toBe(1);
    expect(diffDates(ms('2025-01-01'), ms('2025-01-08'), true)).toMatchObject({ days: 8, weeks: 1, weekDays: 1 });
  });

  it('adds months and years with end-of-month clamping', () => {
    expect(fmtYmd(addToDate(ms('2024-02-29'), 1, 'years'))).toBe('2025-02-28');
    expect(fmtYmd(addToDate(ms('2024-01-31'), 1, 'months'))).toBe('2024-02-29');
    expect(fmtYmd(addToDate(ms('2024-02-28'), 1, 'days'))).toBe('2024-02-29');
    expect(fmtYmd(addToDate(ms('2024-03-01'), -2, 'weeks'))).toBe('2024-02-16');
  });

  it('rejects impossible dates', () => {
    expect(parseDate('2023-02-29')).toEqual({ ok: false, error: '2023-02-29 is not a real calendar date.' });
    expect(parseDate('03/01/2024').ok).toBe(false);
  });
});
