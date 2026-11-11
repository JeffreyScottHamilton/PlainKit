import type { Cue } from './model';
import { formatTime } from './model';

/** Renumbers from 1. Blocks end with one newline and are separated by one blank line, so canonical input is byte-stable. */
export function toSrt(cues: Cue[]): string {
  return cues.map((c, i) => block([String(i + 1), `${formatTime(c.start, ',')} --> ${formatTime(c.end, ',')}`, c.text])).join('');
}

/** preamble is the verbatim VTT header and NOTE/STYLE/REGION blocks. Defaults to a plain "WEBVTT" header. */
export function toVtt(cues: Cue[], preamble: string[]): string {
  const head = preamble.length ? preamble : ['WEBVTT'];
  const timing = (c: Cue) => `${formatTime(c.start, '.')} --> ${formatTime(c.end, '.')}${c.settings ? ` ${c.settings}` : ''}`;
  return head.map((h) => `${h}\n\n`).join('') + cues.map((c) => block([c.id, timing(c), c.text])).join('');
}

/** One block: optional id line, timing line, then text lines. Empty text adds no line. */
function block(parts: (string | undefined)[]): string {
  const lines = parts.filter((p): p is string => p !== undefined && p !== '');
  return `${lines.join('\n')}\n\n`;
}
