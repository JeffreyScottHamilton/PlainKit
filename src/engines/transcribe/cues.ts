import type { Cue } from '@/engines/subtitles/model';

/** What the recognition worker returns. endMs is null when the model did not close its last timestamp. */
export type Segment = { startMs: number; endMs: number | null; text: string };

export const MIN_CUE_MS = 200;
export const MAX_CUE_CHARS = 84; // two lines of 42
export const LINE_CHARS = 42;
export const MAX_REPEATS = 4; // the same text this many times in a row is a loop, not speech
const MS_PER_CHAR = 60; // only used to guess an end time the model did not give

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const key = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const num = (n: number | null | undefined): number | null => (typeof n === 'number' && Number.isFinite(n) ? n : null);

/** Break text at sentence ends, then commas, then spaces, so every piece is at most max characters. */
export function splitText(text: string, max = MAX_CUE_CHARS): string[] {
  const t = clean(text);
  if (t.length <= max) return t ? [t] : [];
  const pieces: string[] = [];
  const sentences = t.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/gu) ?? [t];
  let cur = '';
  const flush = () => {
    if (cur.trim()) pieces.push(cur.trim());
    cur = '';
  };
  for (const s of sentences) {
    if ((cur + s).trim().length <= max) cur += s;
    else {
      flush();
      if (s.trim().length <= max) cur = s;
      else for (const part of splitHard(s.trim(), max)) pieces.push(part);
    }
  }
  flush();
  return pieces;
}

/** No sentence punctuation to use: cut at the last comma or space before max. */
function splitHard(s: string, max: number): string[] {
  const out: string[] = [];
  let rest = s;
  while (rest.length > max) {
    const head = rest.slice(0, max + 1);
    let cut = Math.max(head.lastIndexOf(', '), head.lastIndexOf('; '));
    if (cut < max / 2) cut = head.lastIndexOf(' ');
    if (cut <= 0) cut = max - 1; // one unbroken word longer than max
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** At most two lines: break at the space nearest the middle when the text is longer than one line. */
export function wrapTwoLines(text: string): string {
  if (text.length <= LINE_CHARS) return text;
  const mid = text.length / 2;
  let best = -1;
  for (let i = 0; i < text.length; i++) if (text[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return best < 0 ? text : `${text.slice(0, best)}\n${text.slice(best + 1)}`;
}

/**
 * Recognition segments to subtitle cues: clamps bad times, collapses repeat loops, splits long text,
 * and makes the cues ordered, non-overlapping and at least MIN_CUE_MS long.
 * audioMs, when known, caps the end of the last cue.
 */
export function segmentsToCues(segments: readonly Segment[], audioMs?: number): Cue[] {
  const items = segments
    .map((s) => ({ start: num(s.startMs), end: num(s.endMs), text: clean(s.text) }))
    .filter((s) => s.text !== '' && s.text !== '[BLANK_AUDIO]');

  // Collapse runs of the same text repeated MAX_REPEATS or more times down to the first one.
  const kept: typeof items = [];
  for (let i = 0; i < items.length; ) {
    let j = i + 1;
    while (j < items.length && key(items[j]!.text) === key(items[i]!.text) && key(items[i]!.text) !== '') j++;
    if (j - i >= MAX_REPEATS) kept.push(items[i]!);
    else kept.push(...items.slice(i, j));
    i = j;
  }

  const cues: Cue[] = [];
  let prevEnd = 0;
  kept.forEach((s, i) => {
    const start = Math.max(0, Math.round(s.start ?? prevEnd));
    const nextStart = num(kept[i + 1]?.start);
    let end = s.end === null ? null : Math.round(s.end);
    if (end === null || end < start + MIN_CUE_MS) {
      // Missing or too short: use the next segment's start, else the audio end, else a length-based guess.
      const guess = nextStart !== null && nextStart >= start + MIN_CUE_MS ? nextStart : audioMs !== undefined && audioMs >= start + MIN_CUE_MS && s.end === null ? audioMs : start + Math.max(MIN_CUE_MS, s.text.length * MS_PER_CHAR);
      end = Math.round(guess);
    }
    if (audioMs !== undefined && end > audioMs && audioMs >= start + MIN_CUE_MS) end = Math.round(audioMs);
    prevEnd = end;

    const parts = splitText(s.text);
    const total = parts.reduce((n, p) => n + p.length, 0) || 1;
    let at = start;
    let used = 0;
    parts.forEach((p, k) => {
      used += p.length;
      const pEnd = k === parts.length - 1 ? end : Math.round(start + ((end - start) * used) / total);
      cues.push({ start: at, end: pEnd, text: wrapTwoLines(p) });
      at = pEnd;
    });
  });

  // Order, then remove overlaps (consecutive chunks often disagree by a few hundred ms).
  cues.sort((a, b) => a.start - b.start);
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i]!;
    const p = cues[i - 1];
    if (p && c.start < p.end) {
      if (c.start - p.start >= MIN_CUE_MS) p.end = c.start;
      else c.start = p.end;
    }
    if (c.end < c.start + MIN_CUE_MS) c.end = c.start + MIN_CUE_MS;
  }
  return cues;
}
