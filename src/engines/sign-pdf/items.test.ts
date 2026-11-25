import { describe, expect, it } from 'vitest';
import { applyPatch, clampPoint, newMarkItem } from './items';
import type { Item } from './types';

const blob = new Blob([new Uint8Array([0])]);

describe('items', () => {
  it('keeps an image aspect ratio when its width changes', () => {
    const it: Item = { id: 'a', kind: 'image', label: 'Signature', page: 0, x: 0, y: 0, w: 100, h: 40, blob };
    const r = applyPatch(it, { w: 200 });
    expect(r.kind === 'image' && r.h).toBe(80);
  });

  it('keeps the whole item on the page', () => {
    const it: Item = { id: 'c', kind: 'check', page: 0, x: 0, y: 0, size: 24 };
    expect(clampPoint(it, 300, 400, -50, 500)).toEqual({ x: 0, y: 376 });
    expect(clampPoint(it, 300, 400, 100, 100)).toEqual({ x: 100, y: 100 });
  });

  it('centres a new signature and scales it to the page width', () => {
    const it = newMarkItem('s', 'Signature', { blob, w: 400, h: 100 }, 0, 200, 300);
    expect(it.w).toBe(180);
    expect(it.h).toBe(45);
    expect(it.x).toBe(10);
  });
});
