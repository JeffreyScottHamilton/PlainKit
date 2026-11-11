export type TsUnit = 'auto' | 'seconds' | 'milliseconds';
export type TsParse = { ok: true; ms: number; assumed: string } | { ok: false; message: string };

const MAX_MS = 8.64e15;

/** Numbers below 1e11 read as seconds (year 5138 in seconds, 1973 in milliseconds). */
export function parseTimestamp(input: string, unit: TsUnit): TsParse {
  const s = input.trim();
  if (s === '') return { ok: false, message: 'Enter a Unix time or an ISO 8601 date.' };
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    let asSeconds: boolean;
    let assumed: string;
    if (unit === 'auto') {
      asSeconds = Math.abs(n) < 1e11;
      assumed = asSeconds ? 'Assumed seconds (|value| < 100000000000). Change the unit to override.' : 'Assumed milliseconds (|value| >= 100000000000). Change the unit to override.';
    } else {
      asSeconds = unit === 'seconds';
      assumed = `Read as ${asSeconds ? 'seconds' : 'milliseconds'} (set by you).`;
    }
    const ms = asSeconds ? n * 1000 : n;
    if (Math.abs(ms) > MAX_MS) return { ok: false, message: 'That value is outside the range JavaScript dates support.' };
    return { ok: true, ms, assumed };
  }
  return isoToMs(s);
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?(Z|[+-]\d{2}:?\d{2})?$/i;

export function isoToMs(s: string): TsParse {
  const m = ISO.exec(s);
  if (!m) return { ok: false, message: 'Not a Unix time or ISO 8601 date. Examples: 1767225600, 2026-01-01, 2026-01-01T12:00:00Z.' };
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const hh = Number(m[4] ?? 0);
  const mi = Number(m[5] ?? 0);
  const ss = Number(m[6] ?? 0);
  const frac = m[7] ? Math.floor(Number(`0.${m[7]}`) * 1000) : 0;
  if (mo < 1 || mo > 12) return { ok: false, message: 'Month must be 01-12.' };
  if (new Date(Date.UTC(y, mo - 1, d)).getUTCDate() !== d) return { ok: false, message: 'That day does not exist in that month.' };
  if (hh > 23 || mi > 59 || ss > 60) return { ok: false, message: 'Time must be 00:00-23:59 (seconds 00-60).' };
  const zone = m[8];
  let ms: number;
  let assumed: string;
  if (zone) {
    const off = zone.toUpperCase() === 'Z' ? 0 : (zone[0] === '-' ? -1 : 1) * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(-2)));
    ms = Date.UTC(y, mo - 1, d, hh, mi, ss, frac) - off * 60000;
    assumed = 'Read with the zone you wrote.';
  } else if (m[4] === undefined) {
    ms = Date.UTC(y, mo - 1, d);
    assumed = 'Date only: read as UTC midnight.';
  } else {
    ms = new Date(y, mo - 1, d, hh, mi, ss, frac).getTime();
    assumed = 'No zone written: read as your local time.';
  }
  if (Number.isNaN(ms) || Math.abs(ms) > MAX_MS) return { ok: false, message: 'That date is outside the range JavaScript supports.' };
  return { ok: true, ms, assumed };
}

/** Local time with its UTC offset, for example 2026-01-01T13:00:00.000+01:00. */
export function localIso(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
