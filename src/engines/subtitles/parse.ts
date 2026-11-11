import type { Cue, Format, ParseError } from './model';
import { parseTime } from './model';

export type Parsed = { format: Format; cues: Cue[]; /** VTT header and NOTE/STYLE/REGION blocks, verbatim. Empty for SRT. */ preamble: string[]; errors: ParseError[] };

type Block = { lines: string[]; line: number };
const PREAMBLE = /^(NOTE|STYLE|REGION)(\s|$)/;

/** Tolerant SRT/WebVTT parser. Line numbers are 1-based and refer to the input after CRLF normalization. */
export function parseSubtitles(input: string): Parsed {
  const text = (input.charCodeAt(0) === 0xfeff ? input.slice(1) : input).replace(/\r\n?/g, '\n');
  const all = text.split('\n');
  const format: Format = /^WEBVTT/.test(all[0] ?? '') ? 'vtt' : 'srt';
  const errors: ParseError[] = [];
  const preamble: string[] = [];
  const cues: Cue[] = [];

  let blocks = groupBlocks(all);
  if (format === 'vtt' && blocks.length) {
    // The header block ends at the first blank line. If a cue starts before that (no blank line), split it off.
    const first = blocks[0] as Block;
    const t = first.lines.findIndex((l) => l.includes('-->'));
    if (t !== -1) {
      const cut = Math.max(1, t - 1);
      blocks = [{ lines: first.lines.slice(0, cut), line: first.line }, { lines: first.lines.slice(cut), line: first.line + cut }, ...blocks.slice(1)];
    }
    preamble.push((blocks[0] as Block).lines.join('\n'));
    blocks = blocks.slice(1);
  }

  for (const b of blocks) {
    if (format === 'vtt' && PREAMBLE.test(b.lines[0] ?? '')) {
      preamble.push(b.lines.join('\n'));
      continue;
    }
    for (const c of chunks(b.lines, b.line)) {
      const cue = parseChunk(c, format);
      if (typeof cue === 'string') errors.push({ line: c.line, message: cue });
      else cues.push(cue);
    }
  }
  return { format, cues, preamble, errors };
}

function groupBlocks(all: string[]): Block[] {
  const out: Block[] = [];
  let cur: string[] = [];
  let start = 1;
  all.forEach((l, i) => {
    if (l.trim() === '') {
      if (cur.length) out.push({ lines: cur, line: start });
      cur = [];
    } else {
      if (!cur.length) start = i + 1;
      cur.push(l);
    }
  });
  if (cur.length) out.push({ lines: cur, line: start });
  return out;
}

/** A missing blank line between cues still separates them: a line followed by a timing line starts a new cue. */
function chunks(lines: string[], first: number): Block[] {
  const out: Block[] = [];
  let cur: string[] = [];
  let curLine = first;
  lines.forEach((l, i) => {
    const nextTiming = (lines[i + 1] ?? '').includes('-->');
    if (!l.includes('-->') && nextTiming && cur.length) {
      out.push({ lines: cur, line: curLine });
      cur = [];
    }
    if (!cur.length) curLine = first + i;
    cur.push(l);
  });
  if (cur.length) out.push({ lines: cur, line: curLine });
  return out;
}

function parseChunk(c: Block, format: Format): Cue | string {
  const t = c.lines.findIndex((l) => l.includes('-->'));
  if (t === -1) return 'Not a cue: no "-->" timing line. This text was not imported.';
  const timing = c.lines[t] ?? '';
  const [left = '', right = ''] = timing.split('-->');
  const [endStr = '', ...rest] = right.trim().split(/\s+/);
  const start = parseTime(left);
  const end = parseTime(endStr);
  if (start === null || end === null) return `Timing is not HH:MM:SS.mmm --> HH:MM:SS.mmm: "${timing.trim()}". This cue was not imported.`;
  const cue: Cue = { start, end, text: c.lines.slice(t + 1).join('\n') };
  if (format === 'vtt' && t === 1) cue.id = c.lines[0] ?? '';
  const settings = rest.join(' ');
  if (settings) cue.settings = settings;
  return cue;
}
