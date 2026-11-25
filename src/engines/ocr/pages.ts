export type PageSpec = { ok: true; pages: number[] } | { ok: false; message: string };

/**
 * Parses "1-3, 5, 8-" (1-based, blank or "all" = every page) against a known page count.
 * Returns sorted, de-duplicated page numbers, or a message the user can act on.
 */
export function parsePageSpec(spec: string, pageCount: number): PageSpec {
  const s = spec.trim().toLowerCase();
  if (pageCount < 1) return { ok: false, message: 'This PDF has no pages.' };
  if (s === '' || s === 'all') return { ok: true, pages: range(1, pageCount) };
  const set = new Set<number>();
  for (const part of s.split(',')) {
    const m = /^(\d+)?\s*(-\s*(\d+)?)?$/.exec(part.trim());
    if (!m || (m[1] === undefined && m[2] === undefined)) return { ok: false, message: `"${part.trim()}" is not a page or page range. Use values like 1, 3-5 or 8-.` };
    const from = m[1] === undefined ? 1 : Number(m[1]);
    const to = m[2] === undefined ? from : m[3] === undefined ? pageCount : Number(m[3]);
    if (from < 1 || to > pageCount) return { ok: false, message: `Pages must be between 1 and ${pageCount}.` };
    if (from > to) return { ok: false, message: `"${part.trim()}" runs backwards. Write the smaller page first.` };
    for (let p = from; p <= to; p++) set.add(p);
  }
  return { ok: true, pages: [...set].sort((a, b) => a - b) };
}

function range(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}
