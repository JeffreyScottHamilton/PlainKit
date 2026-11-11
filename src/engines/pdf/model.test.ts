import { describe, expect, it } from 'vitest';
import { commit, createHistory, mapAll, MAX_HISTORY, move, moveMany, parseRanges, redo, remove, rotate, undo, type PageRef } from './model';
import { refsFor } from './fixtures';

const keys = (ps: PageRef[]) => ps.map((p) => p.key);
const abc = () => [...refsFor('a', 3, 'a')];

describe('page operations', () => {
  it('move returns a new array with the page at the target index', () => {
    const src = abc();
    expect(keys(move(src, 0, 2))).toEqual(['a:1', 'a:2', 'a:0']);
    expect(keys(move(src, 2, 0))).toEqual(['a:2', 'a:0', 'a:1']);
    expect(keys(src)).toEqual(['a:0', 'a:1', 'a:2']);
  });

  it('move rejects out-of-range indices', () => {
    expect(() => move(abc(), 3, 0)).toThrow(RangeError);
    expect(() => move(abc(), 0, -1)).toThrow(RangeError);
  });

  it('moveMany keeps the selected pages in their relative order', () => {
    const src = refsFor('a', 5, 'p');
    expect(keys(moveMany(src, ['p:3', 'p:1'], 0))).toEqual(['p:1', 'p:3', 'p:0', 'p:2', 'p:4']);
    expect(keys(moveMany(src, ['p:0', 'p:1'], 3))).toEqual(['p:2', 'p:3', 'p:4', 'p:0', 'p:1']);
    expect(() => moveMany(src, ['p:0'], 5)).toThrow(RangeError);
  });

  it('rotate adds deltas and normalizes to 0..270', () => {
    const src = abc();
    const once = rotate(src, ['a:1'], 90);
    expect(once[1]!.rotation).toBe(90);
    expect(rotate(once, ['a:1'], 270)[1]!.rotation).toBe(0);
    expect(rotate(src, ['a:0'], -90)[0]!.rotation).toBe(270);
    expect(rotate(src, ['a:0'], 180)[0]!.rotation).toBe(180);
    expect(src[1]!.rotation).toBe(0);
  });

  it('remove drops the keyed pages only', () => {
    expect(keys(remove(abc(), ['a:0', 'a:2']))).toEqual(['a:1']);
  });
});

describe('parseRanges', () => {
  it('accepts ranges, single pages and open ends (1-based, sorted, unique)', () => {
    expect(parseRanges('1-3,5', 6)).toEqual({ ok: true, indices: [0, 1, 2, 4] });
    expect(parseRanges(' 5, 2-3 ,3 ', 6)).toEqual({ ok: true, indices: [1, 2, 4] });
    expect(parseRanges('4-', 5)).toEqual({ ok: true, indices: [3, 4] });
    expect(parseRanges('1-1', 1)).toEqual({ ok: true, indices: [0] });
  });

  it.each([
    ['', 'Enter page numbers'],
    ['0', 'Pages go from 1 to 5'],
    ['6', 'Pages go from 1 to 5'],
    ['3-1', 'ends before it starts'],
    ['2-9', 'Pages go from 1 to 5'],
    ['a', 'is not a page number'],
    ['1,,2', 'is not a page number'],
    ['1-2-3', 'is not a page number'],
    ['-3', 'is not a page number'],
    ['1.5', 'is not a page number'],
  ])('rejects %j with a message', (text, msg) => {
    const r = parseRanges(text, 5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(msg);
  });
});

describe('undo / redo history', () => {
  it('undoes and redoes whole arrangements, and a new edit clears redo', () => {
    let h = createHistory(abc());
    h = commit(h, move(h.present, 0, 2));
    h = commit(h, rotate(h.present, ['a:0'], 90));
    expect(h.present[2]!.rotation).toBe(90);
    h = undo(h);
    expect(h.present[2]!.rotation).toBe(0);
    h = undo(h);
    expect(keys(h.present)).toEqual(['a:0', 'a:1', 'a:2']);
    h = redo(h);
    expect(keys(h.present)).toEqual(['a:1', 'a:2', 'a:0']);
    h = undo(h);
    h = commit(h, remove(h.present, ['a:1']));
    expect(h.future).toEqual([]);
    expect(redo(h)).toBe(h);
  });

  it('is bounded to 50 steps', () => {
    let h = createHistory(abc());
    for (let i = 0; i < 80; i++) h = commit(h, rotate(h.present, ['a:0'], 90));
    expect(h.past.length).toBe(MAX_HISTORY);
    let n = 0;
    while (h.past.length) {
      h = undo(h);
      n++;
    }
    expect(n).toBe(MAX_HISTORY);
    expect(h.future.length).toBe(MAX_HISTORY);
  });

  it('shares page objects between snapshots (no copies of page data)', () => {
    const src = abc();
    const h = commit(createHistory(src), move(src, 0, 1));
    expect(h.past[0]![0]).toBe(src[0]);
  });

  it('mapAll applies a source-level change to every snapshot', () => {
    let h = commit(createHistory(abc()), move(abc(), 0, 1));
    h = mapAll(h, (ps) => [...ps, { key: 'b:0', srcId: 'b', srcIndex: 0, rotation: 0 }]);
    expect(h.present.at(-1)!.key).toBe('b:0');
    expect(h.past[0]!.at(-1)!.key).toBe('b:0');
    h = mapAll(h, (ps) => ps.filter((p) => p.srcId !== 'a'));
    expect(keys(h.present)).toEqual(['b:0']);
  });
});
