import { describe, expect, it } from 'vitest';
import { segmentsToCues, splitText, wrapTwoLines, MIN_CUE_MS } from './cues';
import { validate } from '@/engines/subtitles/validate';

const seg = (startMs: number, endMs: number | null, text: string) => ({ startMs, endMs, text });

describe('segmentsToCues', () => {
  it('converts simple segments and trims text', () => {
    expect(segmentsToCues([seg(0, 1500, '  Hello   world '), seg(1500, 3000, 'Second.')])).toEqual([
      { start: 0, end: 1500, text: 'Hello world' },
      { start: 1500, end: 3000, text: 'Second.' },
    ]);
  });
  it('clamps negative and NaN times and enforces a minimum length', () => {
    const c = segmentsToCues([seg(-500, 10, 'a'), seg(NaN, NaN, 'b'), seg(5000, 5000, 'c')]);
    expect(c.every((x) => x.start >= 0 && Number.isFinite(x.start) && x.end >= x.start + MIN_CUE_MS)).toBe(true);
    expect(validate(c).filter((i) => i.severity === 'error')).toEqual([]);
  });
  it('fixes overlaps between chunks', () => {
    const c = segmentsToCues([seg(0, 4000, 'one'), seg(3500, 6000, 'two'), seg(3600, 7000, 'three')]);
    for (let i = 1; i < c.length; i++) expect(c[i]!.start).toBeGreaterThanOrEqual(c[i - 1]!.end);
    expect(c.every((x) => x.end - x.start >= MIN_CUE_MS)).toBe(true);
  });
  it('drops empty text and blank-audio tags', () => {
    expect(segmentsToCues([seg(0, 1000, '   '), seg(1000, 2000, '[BLANK_AUDIO]'), seg(2000, 3000, 'ok')])).toHaveLength(1);
  });
  it('collapses 4 or more identical repeats to one, keeps 3', () => {
    const four = segmentsToCues([1, 2, 3, 4].map((i) => seg(i * 1000, i * 1000 + 900, 'Thank you.')));
    expect(four).toHaveLength(1);
    const three = segmentsToCues([1, 2, 3].map((i) => seg(i * 1000, i * 1000 + 900, 'Thank you!')));
    expect(three).toHaveLength(3);
  });
  it('gives a final segment with null end the audio end, or a guess without it', () => {
    expect(segmentsToCues([seg(1000, null, 'last words')], 9000)[0]).toMatchObject({ start: 1000, end: 9000 });
    const guess = segmentsToCues([seg(1000, null, 'last words')])[0]!;
    expect(guess.end).toBeGreaterThan(1000 + MIN_CUE_MS - 1);
  });
  it('splits a long segment at sentence ends with proportional times and two lines at most', () => {
    const text = 'This is the first sentence of a long passage. Here is a second one that keeps going on and on. And a third.';
    const c = segmentsToCues([seg(0, 10000, text)]);
    expect(c.length).toBeGreaterThan(1);
    expect(c[0]!.start).toBe(0);
    expect(c[c.length - 1]!.end).toBe(10000);
    for (const x of c) {
      expect(x.text.replace('\n', ' ').length).toBeLessThanOrEqual(84);
      expect(x.text.split('\n').length).toBeLessThanOrEqual(2);
    }
    expect(c.map((x) => x.text.replace('\n', ' ')).join(' ')).toBe(text);
  });
});

describe('splitText / wrapTwoLines', () => {
  it('splits text with no punctuation at spaces', () => {
    const t = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
    const parts = splitText(t);
    expect(parts.every((p) => p.length <= 84)).toBe(true);
    expect(parts.join(' ')).toBe(t);
  });
  it('wraps text over 42 chars into two balanced lines', () => {
    const w = wrapTwoLines('one two three four five six seven eight nine ten eleven twelve');
    expect(w.split('\n')).toHaveLength(2);
  });
});
