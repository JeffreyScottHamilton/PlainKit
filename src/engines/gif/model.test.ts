import { describe, expect, it } from 'vitest';
import { buildPlan, clampMs, moveEntry, reconcileEntries, removeEntry, reverseEntries, setAllMs, setEntryMs, totalMs } from './model';
import type { Entry } from './types';

const list = (...ids: string[]): Entry[] => ids.map((id, i) => ({ id, ms: 100 * (i + 1) }));
const ids = (l: Entry[]) => l.map((e) => e.id);

describe('frame list edits', () => {
  it('moves a frame earlier and later', () => {
    expect(ids(moveEntry(list('a', 'b', 'c'), 2, 0))).toEqual(['c', 'a', 'b']);
    expect(ids(moveEntry(list('a', 'b', 'c'), 0, 1))).toEqual(['b', 'a', 'c']);
  });
  it('ignores moves that leave the list', () => {
    expect(ids(moveEntry(list('a', 'b'), 0, -1))).toEqual(['a', 'b']);
    expect(ids(moveEntry(list('a', 'b'), 1, 2))).toEqual(['a', 'b']);
  });
  it('removes one frame and keeps the others with their durations', () => {
    expect(removeEntry(list('a', 'b', 'c'), 1)).toEqual([
      { id: 'a', ms: 100 },
      { id: 'c', ms: 300 },
    ]);
  });
  it('reverses the order without touching durations', () => {
    expect(reverseEntries(list('a', 'b', 'c'))).toEqual([
      { id: 'c', ms: 300 },
      { id: 'b', ms: 200 },
      { id: 'a', ms: 100 },
    ]);
  });
  it('sets one duration and clamps it to the playable range', () => {
    expect(setEntryMs(list('a', 'b'), 1, 500)[1]!.ms).toBe(500);
    expect(setEntryMs(list('a', 'b'), 0, 1)[0]!.ms).toBe(20);
    expect(setEntryMs(list('a', 'b'), 0, 1e9)[0]!.ms).toBe(60000);
  });
  it('sets every duration at once', () => {
    expect(setAllMs(list('a', 'b'), 250).map((e) => e.ms)).toEqual([250, 250]);
  });
  it('clampMs rounds to whole milliseconds', () => {
    expect(clampMs(33.6)).toBe(34);
  });
});

describe('reconcileEntries', () => {
  it('keeps the order and edits of frames that still exist and appends new ones', () => {
    const prev: Entry[] = [
      { id: 'b', ms: 900 },
      { id: 'a', ms: 50 },
    ];
    const probed: Entry[] = [
      { id: 'a', ms: 100 },
      { id: 'b', ms: 100 },
      { id: 'c', ms: 100 },
    ];
    expect(reconcileEntries(prev, probed)).toEqual([
      { id: 'b', ms: 900 },
      { id: 'a', ms: 50 },
      { id: 'c', ms: 100 },
    ]);
  });
  it('drops frames that are gone from the source', () => {
    expect(reconcileEntries([{ id: 'x', ms: 1 }], [{ id: 'y', ms: 2 }])).toEqual([{ id: 'y', ms: 2 }]);
  });
});

describe('buildPlan', () => {
  it('applies speed by dividing every delay', () => {
    expect(buildPlan(list('a', 'b'), { speed: 2, skip: 1 })).toEqual([
      { id: 'a', ms: 50 },
      { id: 'b', ms: 100 },
    ]);
  });
  it('keeps every Nth frame with N times its duration, so the length is kept', () => {
    const plan = buildPlan(list('a', 'b', 'c', 'd', 'e'), { speed: 1, skip: 2 });
    expect(ids(plan)).toEqual(['a', 'c', 'e']);
    expect(plan.map((e) => e.ms)).toEqual([200, 600, 1000]);
  });
  it('clamps the result to the shortest playable delay', () => {
    expect(buildPlan([{ id: 'a', ms: 20 }], { speed: 4, skip: 1 })).toEqual([{ id: 'a', ms: 20 }]);
  });
  it('totals the durations of a plan', () => {
    expect(totalMs(list('a', 'b', 'c'))).toBe(600);
  });
});
