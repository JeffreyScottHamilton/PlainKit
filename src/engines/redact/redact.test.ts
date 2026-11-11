// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { centeredRect, clampRect, commit, describeRegion, keyEdit, makeRegion, MAX_HISTORY, newHistory, redo, resizeFromCorner, undo, updateRegion, addRegion, removeRegion, rectFromPoints, type Region } from './model';
import { fitLayout, toImage, toPreview } from './coords';

const B = { width: 800, height: 600 };
const reg = (id: string, x: number, y: number, w: number, h: number, style: Region['style'] = 'solid') => makeRegion(id, { x, y, w, h }, style);

describe('model: clamping', () => {
  it('keeps a rect inside the image and at least 1 px', () => {
    expect(clampRect({ x: -50, y: 590, w: 2000, h: 0 }, B)).toEqual({ x: 0, y: 599, w: 800, h: 1 });
    expect(clampRect({ x: 790, y: 10, w: 40, h: 40 }, B)).toEqual({ x: 760, y: 10, w: 40, h: 40 });
    expect(clampRect({ x: 1.6, y: 2.4, w: 10.2, h: 9.7 }, B)).toEqual({ x: 2, y: 2, w: 10, h: 10 });
  });

  it('updateRegion clamps the patched region only', () => {
    const regions = [reg('a', 0, 0, 10, 10), reg('b', 5, 5, 10, 10)];
    const next = updateRegion(regions, 'a', { x: 9999 }, B);
    expect(next[0]).toMatchObject({ x: 790, w: 10 });
    expect(next[1]).toBe(regions[1]);
  });

  it('centeredRect is a quarter of the image, centred', () => {
    expect(centeredRect(B)).toEqual({ x: 300, y: 225, w: 200, h: 150 });
  });
});

describe('model: region operations', () => {
  it('adds, removes and restyles regions immutably', () => {
    const base = [reg('a', 0, 0, 10, 10)];
    const added = addRegion(base, reg('b', 20, 20, 10, 10, 'blur'), B);
    expect(added.map((r) => r.id)).toEqual(['a', 'b']);
    expect(base).toHaveLength(1);
    expect(removeRegion(added, 'a').map((r) => r.id)).toEqual(['b']);
    expect(updateRegion(added, 'b', { style: 'pixelate' }, B)[1]!.style).toBe('pixelate');
  });

  it('resizes from a corner with the opposite corner fixed, and flips when dragged past it', () => {
    const r = reg('a', 100, 100, 50, 40);
    expect(resizeFromCorner(r, 'se', 180, 170)).toEqual({ x: 100, y: 100, w: 80, h: 70 });
    expect(resizeFromCorner(r, 'nw', 120, 120)).toEqual({ x: 120, y: 120, w: 30, h: 20 });
    expect(rectFromPoints(10, 10, 4, 30)).toEqual({ x: 4, y: 10, w: 6, h: 20 });
  });

  it('keyboard edits move by 1, or 10 with Shift, and resize with Alt', () => {
    const r = reg('a', 100, 100, 50, 40);
    expect(keyEdit(r, 'ArrowRight', { shift: false, alt: false })).toEqual({ x: 101 });
    expect(keyEdit(r, 'ArrowUp', { shift: true, alt: false })).toEqual({ y: 90 });
    expect(keyEdit(r, 'ArrowDown', { shift: false, alt: true })).toEqual({ h: 41 });
    expect(keyEdit(r, 'ArrowLeft', { shift: true, alt: true })).toEqual({ w: 40 });
    expect(keyEdit(r, 'Enter', { shift: false, alt: false })).toBeNull();
  });

  it('describes a region for the list', () => {
    expect(describeRegion(reg('a', 300, 200, 120, 40), 0)).toBe('Region 1, solid, 120×40 at 300,200');
  });
});

describe('model: bounded undo and redo', () => {
  it('undo and redo walk the states back and forth', () => {
    let h = newHistory([]);
    h = commit(h, [reg('a', 0, 0, 1, 1)]);
    h = commit(h, [reg('a', 5, 0, 1, 1)]);
    h = undo(h);
    expect(h.present[0]!.x).toBe(0);
    h = redo(h);
    expect(h.present[0]!.x).toBe(5);
    expect(undo(undo(undo(h))).present).toEqual([]);
  });

  it('a new commit clears the redo stack; identical state is not recorded', () => {
    let h = commit(newHistory(), [reg('a', 0, 0, 1, 1)]);
    h = undo(h);
    h = commit(h, [reg('b', 0, 0, 1, 1)]);
    expect(h.future).toEqual([]);
    const same = commit(h, h.present);
    expect(same.past).toBe(h.past);
  });

  it('caps the undo stack at MAX_HISTORY and drops the oldest', () => {
    let h = newHistory();
    for (let i = 0; i < MAX_HISTORY + 30; i++) h = commit(h, [reg('a', i % 700, 0, 1, 1)]);
    expect(h.past).toHaveLength(MAX_HISTORY);
    expect(h.past[0]![0]!.x).toBe(30);
    expect(h.present[0]!.x).toBe((MAX_HISTORY + 29) % 700);
  });
});

describe('coords: preview to image mapping', () => {
  it('round-trips at several scales and letterbox offsets', () => {
    const cases = [
      [800, 600, 800, 600],
      [800, 600, 400, 500], // width-limited: letterbox top and bottom
      [800, 600, 1200, 300], // height-limited: letterbox left and right
      [4032, 3024, 333, 250],
      [640, 480, 1000, 1000],
    ] as const;
    for (const [iw, ih, bw, bh] of cases) {
      const l = fitLayout(iw, ih, bw, bh);
      for (const [x, y] of [[0, 0], [iw - 1, ih - 1], [Math.floor(iw / 3), Math.floor(ih / 2)]] as const) {
        const p = toPreview(l, x, y);
        const back = toImage(l, p.x, p.y);
        expect(back.x).toBeCloseTo(x, 6);
        expect(back.y).toBeCloseTo(y, 6);
      }
    }
  });

  it('centres the image in the box', () => {
    const l = fitLayout(800, 600, 400, 500);
    expect(l.scale).toBe(0.5);
    expect(l.offsetX).toBe(0);
    expect(l.offsetY).toBe(50);
    expect(toPreview(l, 0, 0)).toEqual({ x: 0, y: 50 });
  });
});
