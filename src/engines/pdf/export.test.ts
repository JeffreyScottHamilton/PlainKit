import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildPdf } from './export';
import { makePdf, readPages, refsFor, type PageSpec } from './fixtures';
import { move, moveMany, remove, rotate, type PageRef } from './model';
import { ToolError } from '@/lib/errors';

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const widths = (pages: { width: number }[]) => pages.map((p) => p.width);

/** Two sources: a has widths 200,201,202; b has 300,301. */
async function twoSources() {
  const a = await makePdf([{ width: 200 }, { width: 201 }, { width: 202 }]);
  const b = await makePdf([{ width: 300 }, { width: 301 }]);
  const sources = new Map([
    ['a', a],
    ['b', b],
  ]);
  const pages = [...refsFor('a', 3, 'a'), ...refsFor('b', 2, 'b')];
  return { a, b, sources, pages };
}

describe('buildPdf', () => {
  it('merges two documents in the given order', async () => {
    const { sources, pages } = await twoSources();
    const out = await buildPdf(pages, sources);
    expect(out.pageCount).toBe(5);
    expect(widths(await readPages(out.bytes))).toEqual([200, 201, 202, 300, 301]);
  });

  it('reorder then export gives the reordered page sizes', async () => {
    const { sources, pages } = await twoSources();
    const moved = move(pages, 4, 0);
    const out = await buildPdf(moved, sources);
    expect(widths(await readPages(out.bytes))).toEqual([301, 200, 201, 202, 300]);
    const block = moveMany(pages, ['b:0', 'a:0'], 3);
    expect(widths(await readPages(await buildPdf(block, sources).then((r) => r.bytes)))).toEqual([201, 202, 301, 200, 300]);
  });

  it('rotates a page that already has /Rotate: the delta is added to its own rotation', async () => {
    const src = await makePdf([{ width: 200, rotate: 90 }, { width: 201 }]);
    const sources = new Map([['s', src]]);
    const pages = rotate(refsFor('s', 2), ['s:0'], 90); // own 90 + 90 = 180
    const pages2 = rotate(pages, ['s:1'], -90); // own 0 + 270 = 270
    const out = await readPages((await buildPdf(pages2, sources)).bytes);
    expect(out.map((p) => p.rotation)).toEqual([180, 270]);
    // Source is untouched.
    expect((await readPages(src))[0]!.rotation).toBe(90);
  });

  it('keeps blank pages and their size', async () => {
    const src = await makePdf([{ width: 210, height: 297 }, { width: 220, height: 280 }]);
    const out = await readPages((await buildPdf(refsFor('s', 2), new Map([['s', src]]))).bytes);
    expect(out).toEqual([
      { width: 210, height: 297, rotation: 0 },
      { width: 220, height: 280, rotation: 0 },
    ]);
  });

  it('preserves mixed dimensions across sources', async () => {
    const a = await makePdf([{ width: 612, height: 792 }]);
    const b = await makePdf([{ width: 300, height: 1000 }]);
    const out = await readPages((await buildPdf([...refsFor('a', 1), ...refsFor('b', 1)], new Map([['a', a], ['b', b]]))).bytes);
    expect(out.map((p) => [p.width, p.height])).toEqual([
      [612, 792],
      [300, 1000],
    ]);
  });

  it('remove drops the pages before export', async () => {
    const { sources, pages } = await twoSources();
    const out = await buildPdf(remove(pages, ['a:1', 'b:0']), sources);
    expect(widths(await readPages(out.bytes))).toEqual([200, 202, 301]);
  });

  it('extract writes only the selected pages in current order', async () => {
    const { sources, pages } = await twoSources();
    const selected = pages.filter((p) => ['b:1', 'a:0'].includes(p.key));
    const out = await buildPdf(selected, sources);
    expect(widths(await readPages(out.bytes))).toEqual([200, 301]);
  });

  it('handles a 20-page mixed document with rotations and reordering', async () => {
    const specs: PageSpec[] = Array.from({ length: 20 }, (_, i) => ({ width: 200 + i, height: i % 2 ? 400 : 300, rotate: i % 4 === 0 ? 90 : 0, text: `page ${i + 1}` }));
    const src = await makePdf(specs);
    let pages: PageRef[] = refsFor('s', 20);
    pages = move(pages, 19, 0);
    pages = rotate(pages, [pages[1]!.key], 180);
    const out = await readPages((await buildPdf(pages, new Map([['s', src]]))).bytes);
    expect(out.length).toBe(20);
    expect(widths(out)[0]).toBe(219);
    // Original page 1 (own /Rotate 90, width 200) got +180 => 270; original page 2 is 400 high.
    expect(out[1]).toEqual({ width: 200, height: 300, rotation: 270 });
    expect(out[2]!.height).toBe(400);
  });

  it('never changes the source bytes', async () => {
    const { a, b, sources, pages } = await twoSources();
    const before = [sha(a), sha(b)];
    await buildPdf(move(pages, 4, 0), sources);
    expect([sha(a), sha(b)]).toEqual(before);
  });

  it('refuses an empty list and a missing source with ToolErrors', async () => {
    await expect(buildPdf([], new Map())).rejects.toBeInstanceOf(ToolError);
    const err = await buildPdf(refsFor('gone', 1), new Map()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).code).toBe('missing-source');
  });
});
