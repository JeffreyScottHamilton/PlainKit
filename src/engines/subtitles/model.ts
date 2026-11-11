export type Cue = {
  /** VTT cue identifier only. SRT indexes are renumbered on output, so they are not kept. */
  id?: string;
  /** Milliseconds. Integers. May be negative only in a file or an unvalidated edit. */
  start: number;
  end: number;
  text: string;
  /** VTT cue settings after the end time, kept verbatim. */
  settings?: string;
};

export type Format = 'srt' | 'vtt';
export type ParseError = { line: number; message: string };
export type Severity = 'error' | 'warning' | 'info';
export type Issue = { index: number; severity: Severity; message: string };

const TIME = /^(-?)(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{3})$/;

/** HH:MM:SS.mmm, HH:MM:SS,mmm, or MM:SS.mmm. A leading minus is parsed so validation can report it. Null when malformed. */
export function parseTime(s: string): number | null {
  const m = TIME.exec(s.trim());
  if (!m) return null;
  const h = Number(m[2] ?? 0);
  const min = Number(m[3]);
  const sec = Number(m[4]);
  if (min > 59 || sec > 59) return null;
  const ms = ((h * 60 + min) * 60 + sec) * 1000 + Number(m[5]);
  return m[1] ? -ms : ms;
}

/** Always HH:MM:SS plus the given separator and three millisecond digits. Exact for integer milliseconds. */
export function formatTime(ms: number, sep: '.' | ','): string {
  const neg = ms < 0 ? '-' : '';
  let v = Math.abs(Math.round(ms));
  const h = Math.floor(v / 3600000);
  v %= 3600000;
  const m = Math.floor(v / 60000);
  v %= 60000;
  const s = Math.floor(v / 1000);
  const p = (n: number, w: number) => String(n).padStart(w, '0');
  return `${neg}${p(h, 2)}:${p(m, 2)}:${p(s, 2)}${sep}${p(v % 1000, 3)}`;
}
