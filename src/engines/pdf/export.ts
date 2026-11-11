import { degrees, PDFDocument, type PDFPage } from 'pdf-lib';
import { ToolError } from '@/lib/errors';
import { loadDocument } from './load';
import type { PageRef } from './model';

export type ExportResult = { bytes: Uint8Array; pageCount: number };

/**
 * Copies pages (vector content and fonts are kept, nothing is rasterized) in the given order.
 * Each page keeps its own size; rotation = own /Rotate + delta. The output is reloaded and its page count checked.
 */
export async function buildPdf(pages: readonly PageRef[], sources: ReadonlyMap<string, Uint8Array>): Promise<ExportResult> {
  if (pages.length === 0) throw new ToolError('empty', 'There are no pages to export.', 'Add a PDF, or select pages to extract.');

  // Group by source so each source is copied in one call (shared fonts and images are copied once).
  const bySource = new Map<string, { srcIndex: number; own: number }[]>();
  const docs = new Map<string, PDFDocument>();
  for (const p of pages) {
    if (!docs.has(p.srcId)) {
      const bytes = sources.get(p.srcId);
      if (!bytes) throw new ToolError('missing-source', 'A source file is no longer available.', 'Add the file again, then export.');
      docs.set(p.srcId, await loadDocument(bytes));
    }
    const src = docs.get(p.srcId)!;
    if (p.srcIndex < 0 || p.srcIndex >= src.getPageCount()) throw new ToolError('bad-page', 'A page is missing from its source file.', 'Remove the page and export again.');
    const list = bySource.get(p.srcId) ?? [];
    list.push({ srcIndex: p.srcIndex, own: src.getPage(p.srcIndex).getRotation().angle });
    bySource.set(p.srcId, list);
  }

  const out = await PDFDocument.create();
  const copies = new Map<string, PDFPage[]>();
  for (const [srcId, occ] of bySource) {
    copies.set(srcId, await out.copyPages(docs.get(srcId)!, occ.map((o) => o.srcIndex)));
  }

  const cursor = new Map<string, number>();
  for (const p of pages) {
    const k = cursor.get(p.srcId) ?? 0;
    cursor.set(p.srcId, k + 1);
    const page = copies.get(p.srcId)![k]!;
    const own = bySource.get(p.srcId)![k]!.own;
    page.setRotation(degrees((own + p.rotation) % 360));
    out.addPage(page);
  }

  const bytes = await out.save();
  const check = await PDFDocument.load(bytes, { updateMetadata: false });
  if (check.getPageCount() !== pages.length) {
    throw new ToolError(
      'verify-failed',
      `The exported file has ${check.getPageCount()} pages instead of ${pages.length}.`,
      'Try again. If it keeps failing, export fewer pages at a time.',
    );
  }
  return { bytes, pageCount: pages.length };
}
