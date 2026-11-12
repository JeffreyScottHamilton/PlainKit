// Pure time parsing and validation for the trim fields. Accepts "mm:ss.mmm", "h:mm:ss.mmm" and plain seconds.

export type ParsedTime = { ok: true; seconds: number } | { ok: false; error: string };
export type TrimRange = { ok: true; start: number; end: number } | { ok: false; error: string; field: 'start' | 'end' };

const BAD_TIME = 'Use a time such as 01:23.450 (minutes:seconds.milliseconds) or plain seconds such as 83.45.';
const DIGITS = /^\d+$/;
const SECONDS = /^\d+(\.\d{1,3})?$/;

export function parseTimecode(input: string): ParsedTime {
  const s = input.trim();
  if (!s) return { ok: false, error: BAD_TIME };
  const parts = s.split(':');
  if (parts.length > 3) return { ok: false, error: BAD_TIME };
  const last = parts.pop() ?? '';
  if (!SECONDS.test(last) || !parts.every((p) => DIGITS.test(p))) return { ok: false, error: BAD_TIME };
  const sec = Number(last);
  const nums = parts.map(Number);
  if (parts.length > 0 && sec >= 60) return { ok: false, error: BAD_TIME };
  if (parts.length === 3) return { ok: false, error: BAD_TIME };
  if (parts.length === 2 && nums[1]! >= 60) return { ok: false, error: BAD_TIME };
  const minutes = parts.length === 2 ? nums[0]! * 60 + nums[1]! : parts.length === 1 ? nums[0]! : 0;
  return { ok: true, seconds: Math.round((minutes * 60 + sec) * 1000) / 1000 };
}

const pad = (n: number, w: number) => String(n).padStart(w, '0');

/** 83.45 -> "01:23.450". Rounds to the millisecond. */
export function formatTimecode(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${pad(m, 2)}:${pad(s, 2)}.${pad(ms % 1000, 3)}`;
}

/** Empty start means 0, empty end means the full duration. End must be after start and inside the duration. */
export function resolveTrim(startText: string, endText: string, duration: number): TrimRange {
  const start = startText.trim() === '' ? { ok: true as const, seconds: 0 } : parseTimecode(startText);
  if (!start.ok) return { ok: false, error: `Start: ${start.error}`, field: 'start' };
  const end = endText.trim() === '' ? { ok: true as const, seconds: duration } : parseTimecode(endText);
  if (!end.ok) return { ok: false, error: `End: ${end.error}`, field: 'end' };
  if (start.seconds >= duration) return { ok: false, error: `Start must be before the end of the video (${formatTimecode(duration)}).`, field: 'start' };
  if (end.seconds > duration + 0.0005) return { ok: false, error: `End is past the end of the video (${formatTimecode(duration)}).`, field: 'end' };
  if (end.seconds <= start.seconds) return { ok: false, error: 'End must be later than start.', field: 'end' };
  return { ok: true, start: start.seconds, end: Math.min(end.seconds, duration) };
}
