import { ToolError } from '@/lib/errors';
import type { Cue } from './model';

export const DEFAULT_CUE_MS = 2000;

export function shiftCues(cues: Cue[], deltaMs: number, selected: Set<number> | null): { cues: Cue[]; clamped: number } {
  const d = Math.round(deltaMs);
  let clamped = 0;
  const out = cues.map((c, i) => {
    if (selected && !selected.has(i)) return c;
    let start = c.start + d;
    let end = c.end + d;
    if (start < 0 || end < 0) clamped++;
    start = Math.max(0, start);
    end = Math.max(0, end);
    return start === c.start && end === c.end ? c : { ...c, start, end };
  });
  return { cues: out, clamped };
}

export function editCue(cues: Cue[], i: number, patch: Partial<Pick<Cue, 'start' | 'end' | 'text'>>): Cue[] {
  return cues.map((c, j) => (j === i ? { ...c, ...patch } : c));
}

/** New cue after i, starting where i ends, DEFAULT_CUE_MS long, empty text. */
export function insertAfter(cues: Cue[], i: number): Cue[] {
  const at = cues[i];
  if (!at) return cues;
  const cue: Cue = { start: at.end, end: at.end + DEFAULT_CUE_MS, text: '' };
  return [...cues.slice(0, i + 1), cue, ...cues.slice(i + 1)];
}

export function deleteCue(cues: Cue[], i: number): Cue[] {
  return cues.filter((_, j) => j !== i);
}

/** Joins cue i with the next one: earliest start, latest end, text one after the other. */
export function mergeWithNext(cues: Cue[], i: number): Cue[] {
  const a = cues[i];
  const b = cues[i + 1];
  if (!a || !b) return cues;
  const merged: Cue = { start: a.start, end: Math.max(a.end, b.end), text: [a.text, b.text].filter((t) => t !== '').join('\n') };
  if (a.id !== undefined) merged.id = a.id;
  if (a.settings !== undefined) merged.settings = a.settings;
  return [...cues.slice(0, i), merged, ...cues.slice(i + 2)];
}

/** Splits at ratio of the duration (0 < ratio < 1). Text: lines go to each part; a one-line text stays in the first part. */
export function splitCue(cues: Cue[], i: number, ratio: number): Cue[] {
  const c = cues[i];
  if (!c) return cues;
  if (!(ratio > 0 && ratio < 1)) throw new ToolError('split', 'Split point must be between 0% and 100%.', 'Enter a percentage between 1 and 99.');
  const t = c.start + Math.round((c.end - c.start) * ratio);
  if (t <= c.start || t >= c.end) throw new ToolError('split', 'The split point is at the edge of the cue.', 'Use a split point further from the start or end.');
  const lines = c.text.split('\n');
  const k = Math.min(Math.max(Math.round(ratio * lines.length), 1), lines.length - 1);
  const [a, b] = lines.length >= 2 ? [lines.slice(0, k).join('\n'), lines.slice(k).join('\n')] : [c.text, ''];
  const first: Cue = { ...c, end: t, text: a };
  const second: Cue = { start: t, end: c.end, text: b };
  if (c.settings !== undefined) second.settings = c.settings;
  return [...cues.slice(0, i), first, second, ...cues.slice(i + 1)];
}

/** Indexes of cues whose text contains query (case-insensitive, literal). */
export function findCues(cues: Cue[], query: string): number[] {
  if (query === '') return cues.map((_, i) => i);
  const q = query.toLowerCase();
  return cues.flatMap((c, i) => (c.text.toLowerCase().includes(q) ? [i] : []));
}

export function replaceInCues(cues: Cue[], find: string, replace: string, matchCase: boolean): { cues: Cue[]; changed: number } {
  if (find === '') return { cues, changed: 0 };
  const esc = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(esc, matchCase ? 'g' : 'gi');
  const r = replace.replace(/\$/g, '$$$$');
  let changed = 0;
  const out = cues.map((c) => {
    const text = c.text.replace(re, r);
    if (text === c.text) return c;
    changed++;
    return { ...c, text };
  });
  return { cues: out, changed };
}
