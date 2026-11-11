import { describe, expect, it } from 'vitest';
import { formatTime, parseTime, type Cue } from './model';
import { parseSubtitles } from './parse';
import { toSrt, toVtt } from './serialize';
import { validate } from './validate';
import { canRedo, canUndo, current, pushHistory, redo, startHistory, undo } from './history';
import { deleteCue, editCue, findCues, insertAfter, mergeWithNext, replaceInCues, shiftCues, splitCue } from './ops';

const SRT = '1\n00:00:01,000 --> 00:00:02,500\nHello there\n\n2\n00:00:03,000 --> 00:00:04,000\nLine one\nLine two\n\n3\n00:01:00,123 --> 00:01:02,001\nBye\n\n';
const VTT = 'WEBVTT\n\nNOTE made by the editor\nwith two lines\n\nSTYLE\n::cue { color: lime }\n\n00:00:01.000 --> 00:00:02.500 align:start position:10%\nHello there\n\n00:00:03.000 --> 00:00:04.000\n<i>Line one</i>\nLine two\n\n00:01:00.123 --> 00:01:02.001\nBye\n\n';

describe('time', () => {
  it('parses comma and dot separators and optional hours, exactly', () => {
    expect(parseTime('00:00:01,000')).toBe(1000);
    expect(parseTime('00:00:01.000')).toBe(1000);
    expect(parseTime('01:02.250')).toBe(62250);
    expect(parseTime('01:02:03.004')).toBe(3723004);
    expect(parseTime('00:00:01')).toBeNull();
    expect(parseTime('00:61:00.000')).toBeNull();
  });
  it('formats with millisecond precision and keeps a sign', () => {
    expect(formatTime(3723004, '.')).toBe('01:02:03.004');
    expect(formatTime(3723004, ',')).toBe('01:02:03,004');
    expect(formatTime(-1500, '.')).toBe('-00:00:01.500');
  });
});

describe('parse and serialize', () => {
  it('SRT canonical file is byte-stable through parse and serialize', () => {
    const p = parseSubtitles(SRT);
    expect(p.format).toBe('srt');
    expect(p.errors).toEqual([]);
    expect(toSrt(p.cues)).toBe(SRT);
  });

  it('VTT canonical file keeps header, NOTE, STYLE and cue settings byte-for-byte', () => {
    const p = parseSubtitles(VTT);
    expect(p.errors).toEqual([]);
    expect(p.preamble).toEqual(['WEBVTT', 'NOTE made by the editor\nwith two lines', 'STYLE\n::cue { color: lime }']);
    expect(p.cues[0]?.settings).toBe('align:start position:10%');
    expect(p.cues[1]?.text).toBe('<i>Line one</i>\nLine two');
    expect(toVtt(p.cues, p.preamble)).toBe(VTT);
  });

  it('accepts CRLF, a BOM, a comma or dot separator, and missing indices', () => {
    const messy = '﻿' + SRT.replace(/\n/g, '\r\n').replace(/^1\r\n/, '').replace(/\r\n\r\n2\r\n/, '\r\n\r\n');
    const p = parseSubtitles(messy);
    expect(p.errors).toEqual([]);
    expect(p.cues.length).toBe(3);
    expect(toSrt(p.cues)).toBe(SRT);
    const dots = parseSubtitles('1\n00:00:01.000 --> 00:00:02.000\nx\n');
    expect(dots.cues[0]).toEqual({ start: 1000, end: 2000, text: 'x' });
  });

  it('VTT hours optional and the id line is kept only for VTT', () => {
    const p = parseSubtitles('WEBVTT\n\nintro-1\n01:02.500 --> 01:03.000\nHi\n');
    expect(p.cues[0]).toEqual({ id: 'intro-1', start: 62500, end: 63000, text: 'Hi' });
    expect(toVtt(p.cues, p.preamble)).toContain('intro-1\n00:01:02.500 --> 00:01:03.000\nHi');
    const s = parseSubtitles('7\n00:00:01,000 --> 00:00:02,000\nHi\n');
    expect(s.cues[0]?.id).toBeUndefined();
  });

  it('a cue with no blank line before the next cue is still split', () => {
    const p = parseSubtitles('1\n00:00:01,000 --> 00:00:02,000\nA\n2\n00:00:03,000 --> 00:00:04,000\nB\n');
    expect(p.cues.map((c) => c.text)).toEqual(['A', 'B']);
  });

  it('keeps Unicode, emoji, and inline tags such as {\\an8} untouched', () => {
    const src = '1\n00:00:01,000 --> 00:00:02,000\n{\\an8}<b>名前</b> مرحبا 🎉👍\n\n';
    const p = parseSubtitles(src);
    expect(p.cues[0]?.text).toBe('{\\an8}<b>名前</b> مرحبا 🎉👍');
    expect(toSrt(p.cues)).toBe(src);
  });

  it('reports a malformed block with its line number and imports the rest', () => {
    const src = '1\n00:00:01,000 --> 00:00:02,000\nGood\n\n2\n00:00:05 --> 00:00:06,000\nBad timing\n\nnot a cue at all\n\n3\n00:00:07,000 --> 00:00:08,000\nAlso good\n';
    const p = parseSubtitles(src);
    expect(p.cues.map((c) => c.text)).toEqual(['Good', 'Also good']);
    expect(p.errors.map((e) => e.line)).toEqual([5, 9]);
    expect(p.errors[0]?.message).toMatch(/not HH:MM:SS.mmm/);
    expect(p.errors[1]?.message).toMatch(/no "-->"/);
  });

  it('a negative time in the file parses and is left for validation', () => {
    const p = parseSubtitles('1\n-00:00:01,000 --> 00:00:02,000\nNeg\n');
    expect(p.cues[0]?.start).toBe(-1000);
    expect(validate(p.cues)[0]?.severity).toBe('error');
  });

  it('SRT to VTT to SRT keeps every time exactly', () => {
    const a = parseSubtitles(SRT).cues;
    const vtt = toVtt(a, []);
    const back = parseSubtitles(vtt);
    expect(back.format).toBe('vtt');
    expect(back.cues.map((c) => [c.start, c.end])).toEqual(a.map((c) => [c.start, c.end]));
    expect(toSrt(back.cues)).toBe(SRT);
  });

  it('VTT to SRT drops the header and NOTE/STYLE blocks (the caller warns with preamble length)', () => {
    const p = parseSubtitles(VTT);
    expect(p.preamble.length).toBe(3);
    expect(toSrt(p.cues)).not.toContain('WEBVTT');
    expect(toSrt(p.cues)).not.toContain('NOTE');
  });
});

describe('validation', () => {
  const c = (start: number, end: number, text = 'x'): Cue => ({ start, end, text });
  it('negative times and end at or before start are errors', () => {
    const issues = validate([c(-1, 500), c(2000, 2000)]);
    expect(issues.map((i) => [i.index, i.severity])).toEqual([
      [0, 'error'],
      [1, 'error'],
    ]);
  });
  it('overlap is a warning, not an error', () => {
    const issues = validate([c(0, 2000), c(1500, 3000)]);
    expect(issues).toEqual([expect.objectContaining({ index: 0, severity: 'warning' })]);
    expect(issues[0]?.message).toMatch(/sometimes intentional/);
  });
  it('very long cues and more than two lines are info', () => {
    const issues = validate([c(0, 21000), c(30000, 31000, 'a\nb\nc')]);
    expect(issues.map((i) => i.severity)).toEqual(['info', 'info']);
  });
});

describe('operations', () => {
  const cues = parseSubtitles(SRT).cues;

  it('shift by +ms moves every cue exactly', () => {
    const r = shiftCues(cues, 1500, null);
    expect(r.clamped).toBe(0);
    expect(r.cues[0]?.start).toBe(2500);
    expect(r.cues[2]?.end).toBe(62001 + 1500);
  });

  it('shift negative clamps at 0 and reports how many cues were clamped', () => {
    const r = shiftCues(cues, -1500, null);
    expect(r.clamped).toBe(1);
    expect(r.cues[0]).toEqual({ start: 0, end: 1000, text: 'Hello there' });
    expect(r.cues[1]?.start).toBe(1500);
  });

  it('shift selected cues only', () => {
    const r = shiftCues(cues, 1000, new Set([1]));
    expect(r.cues[0]).toBe(cues[0]);
    expect(r.cues[1]?.start).toBe(4000);
  });

  it('edit, insert after, delete', () => {
    expect(editCue(cues, 0, { end: 1800 })[0]?.end).toBe(1800);
    expect(cues[0]?.end).toBe(2500);
    const ins = insertAfter(cues, 0);
    expect(ins[1]).toEqual({ start: 2500, end: 4500, text: '' });
    expect(deleteCue(cues, 0).length).toBe(2);
  });

  it('merge with next and split at a ratio', () => {
    const m = mergeWithNext(cues, 0);
    expect(m.length).toBe(2);
    expect(m[0]).toEqual({ start: 1000, end: 4000, text: 'Hello there\nLine one\nLine two' });
    const s = splitCue(cues, 1, 0.5);
    expect(s.length).toBe(4);
    expect(s[1]).toEqual({ start: 3000, end: 3500, text: 'Line one' });
    expect(s[2]).toEqual({ start: 3500, end: 4000, text: 'Line two' });
    expect(() => splitCue(cues, 1, 0)).toThrow(/between 0% and 100%/);
  });

  it('find and replace are literal and count changed cues', () => {
    expect(findCues(cues, 'LINE')).toEqual([1]);
    const r = replaceInCues(cues, 'line', '$1 line', false);
    expect(r.changed).toBe(1);
    expect(r.cues[1]?.text).toBe('$1 line one\n$1 line two');
  });
});

describe('undo and redo', () => {
  it('moves back and forward, and a new edit drops redo', () => {
    let h = startHistory<Cue[]>([]);
    h = pushHistory(h, [{ start: 0, end: 1, text: 'a' }], 50);
    h = pushHistory(h, [{ start: 0, end: 2, text: 'a' }], 50);
    expect(current(undo(h))[0]?.end).toBe(1);
    expect(canRedo(undo(h))).toBe(true);
    expect(current(redo(undo(h)))[0]?.end).toBe(2);
    const branched = pushHistory(undo(h), [], 50);
    expect(canRedo(branched)).toBe(false);
    expect(canUndo(undo(undo(undo(branched))))).toBe(false);
  });
  it('is bounded to 50 steps', () => {
    let h = startHistory(0);
    for (let i = 1; i <= 80; i++) h = pushHistory(h, i, 50);
    let n = 0;
    while (canUndo(h)) {
      h = undo(h);
      n++;
    }
    expect(n).toBe(50);
    expect(current(h)).toBe(30);
  });
});
