// Pure region model for redaction. Coordinates are integer IMAGE pixels (after EXIF orientation).

export type RedactStyle = 'solid' | 'pixelate' | 'blur';
export type Region = { id: string; kind: 'rect'; x: number; y: number; w: number; h: number; style: RedactStyle; color?: string };
export type Bounds = { width: number; height: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Corner = 'nw' | 'ne' | 'sw' | 'se';

export const STYLE_LABEL: Record<RedactStyle, string> = { solid: 'solid', pixelate: 'pixelate', blur: 'blur' };
export const MAX_HISTORY = 50;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Integer rect inside the image with at least 1 px in each direction. */
export function clampRect(r: Rect, b: Bounds): Rect {
  const w = clamp(Math.round(r.w), 1, b.width);
  const h = clamp(Math.round(r.h), 1, b.height);
  return { x: clamp(Math.round(r.x), 0, b.width - w), y: clamp(Math.round(r.y), 0, b.height - h), w, h };
}

export const clampRegion = (r: Region, b: Bounds): Region => ({ ...r, ...clampRect(r, b) });

/** Rect from two corner points, normalised so w and h are positive. */
export function rectFromPoints(ax: number, ay: number, bx: number, by: number): Rect {
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}

/** Resizes by dragging one corner; the opposite corner stays fixed. */
export function resizeFromCorner(r: Region, corner: Corner, px: number, py: number): Rect {
  const right = r.x + r.w;
  const bottom = r.y + r.h;
  const [ax, ay] = corner === 'nw' ? [right, bottom] : corner === 'ne' ? [r.x, bottom] : corner === 'sw' ? [right, r.y] : [r.x, r.y];
  return rectFromPoints(ax, ay, px, py);
}

export function makeRegion(id: string, rect: Rect, style: RedactStyle, color?: string): Region {
  return { id, kind: 'rect', ...rect, style, ...(color ? { color } : {}) };
}

/** A box a quarter of the image size, centred. Used by the "Add region" button. */
export function centeredRect(b: Bounds): Rect {
  const w = Math.max(1, Math.round(b.width / 4));
  const h = Math.max(1, Math.round(b.height / 4));
  return { x: Math.round((b.width - w) / 2), y: Math.round((b.height - h) / 2), w, h };
}

export type History = { past: Region[][]; present: Region[]; future: Region[][] };
export const newHistory = (present: Region[] = []): History => ({ past: [], present, future: [] });

function sameRegion(a: Region, b: Region): boolean {
  return a.id === b.id && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.style === b.style && a.color === b.color;
}
function sameRegions(a: Region[], b: Region[]): boolean {
  return a.length === b.length && a.every((r, i) => sameRegion(r, b[i]!));
}

/** Records a new state as one undo step. Identical state is not recorded. Past is bounded to MAX_HISTORY. */
export function commit(h: History, regions: Region[]): History {
  if (sameRegions(h.present, regions)) return h;
  return { past: [...h.past, h.present].slice(-MAX_HISTORY), present: regions, future: [] };
}

export function undo(h: History): History {
  const prev = h.past.at(-1);
  if (!prev) return h;
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future].slice(0, MAX_HISTORY) };
}

export function redo(h: History): History {
  const next = h.future[0];
  if (!next) return h;
  return { past: [...h.past, h.present].slice(-MAX_HISTORY), present: next, future: h.future.slice(1) };
}

export const addRegion = (regions: Region[], r: Region, b: Bounds): Region[] => [...regions, clampRegion(r, b)];
export const removeRegion = (regions: Region[], id: string): Region[] => regions.filter((r) => r.id !== id);

/** Applies a partial rect or style patch to one region and clamps the result to the image. */
export function updateRegion(regions: Region[], id: string, patch: Partial<Rect> & { style?: RedactStyle; color?: string }, b: Bounds): Region[] {
  return regions.map((r) => (r.id === id ? clampRegion({ ...r, ...patch }, b) : r));
}

/** Keyboard edits. Arrows move by 1 px (10 with Shift). Alt+arrows resize: Right/Down grow, Left/Up shrink. */
export function keyEdit(r: Region, key: string, mods: { shift: boolean; alt: boolean }): Partial<Rect> | null {
  const s = mods.shift ? 10 : 1;
  if (mods.alt) {
    if (key === 'ArrowRight') return { w: r.w + s };
    if (key === 'ArrowLeft') return { w: r.w - s };
    if (key === 'ArrowDown') return { h: r.h + s };
    if (key === 'ArrowUp') return { h: r.h - s };
    return null;
  }
  if (key === 'ArrowRight') return { x: r.x + s };
  if (key === 'ArrowLeft') return { x: r.x - s };
  if (key === 'ArrowDown') return { y: r.y + s };
  if (key === 'ArrowUp') return { y: r.y - s };
  return null;
}

/** "Region 1, solid, 120×40 at 300,200" */
export function describeRegion(r: Region, index: number): string {
  return `Region ${index + 1}, ${STYLE_LABEL[r.style]}, ${r.w}×${r.h} at ${r.x},${r.y}`;
}
