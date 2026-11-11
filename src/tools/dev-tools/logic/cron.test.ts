import { describe, expect, it } from 'vitest';
import { describeCron, nextRuns, parseCron } from './cron';

const hm = (d: Date) => `${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

function spec(expr: string) {
  const r = parseCron(expr);
  if (!r.ok) throw new Error(r.message);
  return r.spec;
}

describe('cron', () => {
  it('computes next runs for */15 9-17 * * 1-5 from a fixed Monday morning', () => {
    const from = new Date(2026, 0, 5, 10, 7); // Monday, 5 Jan 2026, local
    expect(nextRuns(spec('*/15 9-17 * * 1-5'), from, 5).map(hm)).toEqual(['5 10:15', '5 10:30', '5 10:45', '5 11:00', '5 11:15']);
  });
  it('skips the weekend from Friday evening', () => {
    const from = new Date(2026, 0, 9, 17, 50); // Friday
    expect(nextRuns(spec('*/15 9-17 * * 1-5'), from, 3).map(hm)).toEqual(['12 09:00', '12 09:15', '12 09:30']);
  });
  it('uses OR when both day-of-month and day-of-week are restricted', () => {
    const from = new Date(2026, 0, 1, 0, 0);
    expect(nextRuns(spec('0 12 1 * 1'), from, 4).map(hm)).toEqual(['1 12:00', '5 12:00', '12 12:00', '19 12:00']);
  });
  it('explains common expressions and rejects invalid ones', () => {
    expect(describeCron('*/15 9-17 * * 1-5')).toContain('Monday through Friday');
    expect(parseCron('* * *')).toEqual({ ok: false, message: 'Expected 5 fields (minute hour day-of-month month day-of-week), found 3.' });
    expect(parseCron('60 * * * *')).toEqual({ ok: false, message: 'minute must be 0-59, got 60.' });
    expect(parseCron('* * * * */0').ok).toBe(false);
  });
});
