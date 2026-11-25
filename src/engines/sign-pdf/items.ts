import type { Item, Mark, MarkItem, TextItem, VectorItem } from './types';

/** Changes a placed item may take from the UI: position, size (w for images, size for text and marks), text. */
export type Patch = { x?: number; y?: number; w?: number; size?: number; text?: string };

export const TEXT_SIZE = 14;
export const VECTOR_SIZE = 24;
const MARK_WIDTH = { Signature: 180, Initials: 70 } as const;

/** Applies a patch to one item. Images keep their aspect ratio when the width changes. */
export function applyPatch(it: Item, p: Patch): Item {
  if (it.kind === 'image') {
    const w = p.w ?? it.w;
    return { ...it, x: p.x ?? it.x, y: p.y ?? it.y, w, h: w * (it.h / it.w) };
  }
  if (it.kind === 'text' || it.kind === 'date') {
    return { ...it, x: p.x ?? it.x, y: p.y ?? it.y, size: p.size ?? it.size, text: p.text ?? it.text };
  }
  return { ...it, x: p.x ?? it.x, y: p.y ?? it.y, size: p.size ?? it.size };
}

/**
 * Box of an item in display points, used for keeping it on the page. Text has no fixed width, so it gets a
 * rough estimate here; the export draws the real width.
 */
export function itemFrame(it: Item): { w: number; h: number } {
  if (it.kind === 'image') return { w: it.w, h: it.h };
  if (it.kind === 'text' || it.kind === 'date') return { w: it.text.length * it.size * 0.6, h: it.size * 1.2 };
  return { w: it.size, h: it.size };
}

/** Keeps the item's box inside the page. */
export function clampPoint(it: Item, pageW: number, pageH: number, x: number, y: number): { x: number; y: number } {
  const f = itemFrame(it);
  return {
    x: Math.min(Math.max(0, x), Math.max(0, pageW - f.w)),
    y: Math.min(Math.max(0, y), Math.max(0, pageH - f.h)),
  };
}

/** A new mark, centred horizontally in the page's upper-middle area. */
export function newMarkItem(id: string, label: MarkItem['label'], mark: Mark, page: number, pageW: number, pageH: number): MarkItem {
  const w = Math.min(MARK_WIDTH[label], pageW * 0.9);
  const h = w * (mark.h / mark.w);
  return { id, kind: 'image', label, page, x: (pageW - w) / 2, y: Math.max(0, pageH * 0.6 - h / 2), w, h, blob: mark.blob };
}

export function newTextItem(id: string, kind: 'text' | 'date', text: string, page: number, pageW: number, pageH: number): TextItem {
  return { id, kind, page, x: pageW * 0.1, y: pageH * 0.6, size: TEXT_SIZE, text };
}

export function newVectorItem(id: string, kind: 'check' | 'cross', page: number, pageW: number, pageH: number): VectorItem {
  return { id, kind, page, x: (pageW - VECTOR_SIZE) / 2, y: pageH * 0.5, size: VECTOR_SIZE };
}

/** Short name for screen readers and the selection editor. */
export function describeItem(it: Item): string {
  const where = `on page ${it.page + 1}`;
  if (it.kind === 'image') return `${it.label} ${where}`;
  if (it.kind === 'text') return `Text "${it.text}" ${where}`;
  if (it.kind === 'date') return `Date ${it.text} ${where}`;
  return `${it.kind === 'check' ? 'Check mark' : 'Cross mark'} ${where}`;
}
