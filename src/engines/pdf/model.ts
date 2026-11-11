// Pure page-arrangement model. Pages are references into source files; no page bytes live here.

export type Rotation = 0 | 90 | 180 | 270;
/** rotation is a delta added to the page's own /Rotate, so it is applied at export, never to the source. */
export type PageRef = { key: string; srcId: string; srcIndex: number; rotation: Rotation };

export const MAX_HISTORY = 50;

export function normalizeRotation(deg: number): Rotation {
  return ((((Math.round(deg / 90) * 90) % 360) + 360) % 360) as Rotation;
}

function assertIndex(pages: readonly PageRef[], i: number, what: string) {
  if (!Number.isInteger(i) || i < 0 || i >= pages.length) throw new RangeError(`${what} ${i} is outside 0..${pages.length - 1}`);
}

/** Move the page at `from` so it ends at index `to` of the result. */
export function move(pages: readonly PageRef[], from: number, to: number): PageRef[] {
  assertIndex(pages, from, 'from');
  assertIndex(pages, to, 'to');
  const next = pages.slice();
  const [page] = next.splice(from, 1);
  next.splice(to, 0, page!);
  return next;
}

/** Move the selected pages, keeping their relative order, so the first one lands at index `to`. */
export function moveMany(pages: readonly PageRef[], keys: Iterable<string>, to: number): PageRef[] {
  const sel = new Set(keys);
  const picked = pages.filter((p) => sel.has(p.key));
  const rest = pages.filter((p) => !sel.has(p.key));
  if (!Number.isInteger(to) || to < 0 || to > rest.length) throw new RangeError(`to ${to} is outside 0..${rest.length}`);
  return [...rest.slice(0, to), ...picked, ...rest.slice(to)];
}

/** delta is a multiple of 90; the result is always 0..270. */
export function rotate(pages: readonly PageRef[], keys: Iterable<string>, delta: number): PageRef[] {
  const sel = new Set(keys);
  return pages.map((p) => (sel.has(p.key) ? { ...p, rotation: normalizeRotation(p.rotation + delta) } : p));
}

export function remove(pages: readonly PageRef[], keys: Iterable<string>): PageRef[] {
  const sel = new Set(keys);
  return pages.filter((p) => !sel.has(p.key));
}

export type RangeResult = { ok: true; indices: number[] } | { ok: false; error: string };

/** "1-3,5,8-" (1-based, open end = last page) -> sorted unique 0-based indices. */
export function parseRanges(text: string, pageCount: number): RangeResult {
  const t = text.replace(/\s+/g, '');
  if (!t) return { ok: false, error: 'Enter page numbers such as 1-3,5.' };
  const out = new Set<number>();
  for (const part of t.split(',')) {
    const m = /^(\d+)(?:-(\d*))?$/.exec(part);
    if (!m) return { ok: false, error: `"${part || ' '}" is not a page number or range. Use forms like 1-3,5,8-.` };
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : m[2] === '' ? pageCount : Number(m[2]);
    if (a < 1 || b < 1 || a > pageCount || b > pageCount) return { ok: false, error: `Pages go from 1 to ${pageCount}.` };
    if (b < a) return { ok: false, error: `"${part}" ends before it starts.` };
    for (let i = a; i <= b; i++) out.add(i - 1);
  }
  return { ok: true, indices: [...out].sort((x, y) => x - y) };
}

/** Undo/redo over whole arrangements. Snapshots share PageRef objects, so history costs one array per step. */
export type History = { past: PageRef[][]; present: PageRef[]; future: PageRef[][] };

export const createHistory = (present: PageRef[] = []): History => ({ past: [], present, future: [] });

export function commit(h: History, next: PageRef[]): History {
  if (next === h.present) return h;
  return { past: [...h.past, h.present].slice(-MAX_HISTORY), present: next, future: [] };
}

export function undo(h: History): History {
  const prev = h.past[h.past.length - 1];
  if (!prev) return h;
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future].slice(0, MAX_HISTORY) };
}

export function redo(h: History): History {
  const next = h.future[0];
  if (!next) return h;
  return { past: [...h.past, h.present].slice(-MAX_HISTORY), present: next, future: h.future.slice(1) };
}

/** Apply a source-level change (adding or dropping a file) to every snapshot, so undo never resurrects or hides it. */
export function mapAll(h: History, f: (pages: PageRef[]) => PageRef[]): History {
  return { past: h.past.map(f), present: f(h.present), future: h.future.map(f) };
}
