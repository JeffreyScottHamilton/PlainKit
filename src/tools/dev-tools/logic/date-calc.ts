// All arithmetic uses UTC calendar days, so daylight saving changes never shift a date.
const DAY = 86400000;

export type YMD = { y: number; m: number; d: number };
export type ParsedDate = { ok: true; ymd: YMD; ms: number } | { ok: false; error: string };

export function parseDate(s: string): ParsedDate {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return { ok: false, error: 'Use the date format YYYY-MM-DD, such as 2024-02-29.' };
  const ymd = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  const ms = Date.UTC(ymd.y, ymd.m - 1, ymd.d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== ymd.y || back.getUTCMonth() !== ymd.m - 1 || back.getUTCDate() !== ymd.d) {
    return { ok: false, error: `${s.trim()} is not a real calendar date.` };
  }
  return { ok: true, ymd, ms };
}

export const fmtYmd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export type DiffResult = {
  days: number;
  weeks: number;
  weekDays: number;
  ymd: YMD;
  order: 'later' | 'earlier' | 'same';
};

/** Inclusive counts both endpoints, so the same date gives 1 day. */
export function diffDates(a: number, b: number, inclusive: boolean): DiffResult {
  const raw = Math.round((b - a) / DAY);
  const order = raw > 0 ? 'later' : raw < 0 ? 'earlier' : 'same';
  const span = Math.abs(raw) + (inclusive ? 1 : 0);
  const start = Math.min(a, b);
  const end = start + span * DAY;
  // Largest whole-month count that does not pass the end; the remainder is days.
  const s = new Date(start);
  const e = new Date(end);
  let months = (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth());
  if (addToDate(start, months, 'months') > end) months--;
  const d = Math.round((end - addToDate(start, months, 'months')) / DAY);
  return { days: span, weeks: Math.floor(span / 7), weekDays: span % 7, ymd: { y: Math.floor(months / 12), m: months % 12, d }, order };
}

export type AddUnit = 'days' | 'weeks' | 'months' | 'years';

/** Months and years clamp to the last day of the target month (Feb 29 + 1 year = Feb 28). */
export function addToDate(ms: number, amount: number, unit: AddUnit): number {
  if (unit === 'days') return ms + amount * DAY;
  if (unit === 'weeks') return ms + amount * 7 * DAY;
  const s = new Date(ms);
  const months = unit === 'years' ? amount * 12 : amount;
  const totalMonths = s.getUTCFullYear() * 12 + s.getUTCMonth() + months;
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths - y * 12;
  const d = Math.min(s.getUTCDate(), daysInMonth(y, m + 1));
  return Date.UTC(y, m, d);
}
