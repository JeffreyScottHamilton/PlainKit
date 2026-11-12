import { PDFDocument } from 'pdf-lib';
import { ToolError } from '@/lib/errors';
import type { EngineContext } from '@/jobs/types';
import { encryptedError, corruptError } from './load';

// Page rendering with pdf.js (its parser runs in its own worker), plus builders that turn images into PDFs.
type PdfJs = typeof import('pdfjs-dist');
let lib: Promise<PdfJs> | undefined;
function loadLib(): Promise<PdfJs> {
  lib ??= import('pdfjs-dist').then((m) => {
    m.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
    return m;
  });
  return lib;
}

export const MAX_PAGES = 200;
const MAX_PAGE_PIXELS = 25_000_000;
export type RenderOptions = { dpi: number; format: 'image/png' | 'image/jpeg'; quality: number };
export type RenderedPage = { blob: Blob; width: number; height: number; widthPt: number; heightPt: number };

const aborted = () => new DOMException('Canceled', 'AbortError');

/** Render every page to an image. Calls onPage as each finishes so callers need not hold all pages. */
export async function renderPages(input: Blob, opts: RenderOptions, ctx: EngineContext, onPage: (p: RenderedPage, index: number, total: number) => Promise<void> | void): Promise<{ pageCount: number; warnings: string[] }> {
  const { getDocument } = await loadLib();
  const task = getDocument({ data: new Uint8Array(await input.arrayBuffer()) });
  const warnings: string[] = [];
  try {
    const doc = await task.promise.catch((e: unknown) => {
      throw e instanceof Error && e.name === 'PasswordException' ? encryptedError() : corruptError();
    });
    if (doc.numPages > MAX_PAGES) throw new ToolError('too-many-pages', `This PDF has ${doc.numPages} pages; the limit here is ${MAX_PAGES}.`, 'Extract a smaller range with the PDF tool first.');
    for (let n = 1; n <= doc.numPages; n++) {
      if (ctx.signal.aborted) throw aborted();
      ctx.onProgress({ stage: 'processing', fraction: (n - 1) / doc.numPages, message: `Page ${n} of ${doc.numPages}` });
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      let scale = opts.dpi / 72;
      if (base.width * scale * base.height * scale > MAX_PAGE_PIXELS) {
        scale = Math.sqrt(MAX_PAGE_PIXELS / (base.width * base.height));
        warnings.push(`Page ${n} was rendered at ${Math.round(scale * 72)} DPI to stay within memory limits.`);
      }
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(vp.width));
      canvas.height = Math.max(1, Math.round(vp.height));
      const g = canvas.getContext('2d');
      if (!g) throw new ToolError('canvas', 'This browser could not create a drawing surface.', 'Try a lower DPI.');
      if (opts.format === 'image/jpeg') {
        g.fillStyle = '#fff';
        g.fillRect(0, 0, canvas.width, canvas.height);
      }
      await page.render({ canvas, canvasContext: g, viewport: vp }).promise;
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, opts.format, opts.quality));
      canvas.width = canvas.height = 0;
      page.cleanup();
      if (!blob || blob.type !== opts.format) throw new ToolError('encode', 'This browser could not write the page image.', 'Try the other image format.');
      await onPage({ blob, width: Math.round(vp.width), height: Math.round(vp.height), widthPt: base.width, heightPt: base.height }, n - 1, doc.numPages);
    }
    return { pageCount: doc.numPages, warnings };
  } finally {
    await task.destroy();
  }
}

export type PageSize = 'image' | 'a4' | 'letter';
const SIZES: Record<Exclude<PageSize, 'image'>, [number, number]> = { a4: [595.28, 841.89], letter: [612, 792] };

/** JPEG and PNG are embedded as they are; other formats are re-encoded to PNG first by the caller. */
export async function imagesToPdf(images: { bytes: Uint8Array; mime: 'image/jpeg' | 'image/png'; widthPt?: number; heightPt?: number }[], pageSize: PageSize, marginPt: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const im of images) {
    const img = im.mime === 'image/jpeg' ? await doc.embedJpg(im.bytes) : await doc.embedPng(im.bytes);
    // Default: 96 px per inch, so 1 px = 0.75 pt.
    const iw = im.widthPt ?? img.width * 0.75;
    const ih = im.heightPt ?? img.height * 0.75;
    if (pageSize === 'image') {
      doc.addPage([iw, ih]).drawImage(img, { x: 0, y: 0, width: iw, height: ih });
    } else {
      let [pw, ph] = SIZES[pageSize];
      if (iw > ih) [pw, ph] = [ph, pw];
      const s = Math.min((pw - 2 * marginPt) / iw, (ph - 2 * marginPt) / ih, 1);
      doc.addPage([pw, ph]).drawImage(img, { x: (pw - iw * s) / 2, y: (ph - ih * s) / 2, width: iw * s, height: ih * s });
    }
  }
  const bytes = await doc.save();
  const check = await PDFDocument.load(bytes);
  if (check.getPageCount() !== images.length) throw new ToolError('verify-failed', 'The PDF did not contain the expected number of pages.', 'Try again.');
  return bytes;
}

/** Lossless: rewrite the file with compressed object streams. Often saves little; sometimes nothing. */
export async function rewritePdf(bytes: Uint8Array): Promise<{ bytes: Uint8Array; pageCount: number }> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes);
  } catch (e) {
    throw e instanceof Error && /encrypt/i.test(e.message) ? encryptedError() : corruptError();
  }
  const out = await doc.save({ useObjectStreams: true });
  const check = await PDFDocument.load(out);
  if (check.getPageCount() !== doc.getPageCount()) throw new ToolError('verify-failed', 'The rewritten PDF lost pages.', 'Keep the original.');
  return { bytes: out, pageCount: doc.getPageCount() };
}

/** Lossy: every page becomes one JPEG picture at the original page size. Text is no longer selectable. */
export async function rasterizePdf(input: Blob, opts: { dpi: number; quality: number }, ctx: EngineContext): Promise<{ bytes: Uint8Array; pageCount: number; warnings: string[] }> {
  const pages: { bytes: Uint8Array; mime: 'image/jpeg'; widthPt: number; heightPt: number }[] = [];
  const r = await renderPages(input, { dpi: opts.dpi, format: 'image/jpeg', quality: opts.quality }, ctx, async (p) => {
    pages.push({ bytes: new Uint8Array(await p.blob.arrayBuffer()), mime: 'image/jpeg', widthPt: p.widthPt, heightPt: p.heightPt });
  });
  ctx.onProgress({ stage: 'exporting' });
  return { bytes: await imagesToPdf(pages, 'image', 0), pageCount: r.pageCount, warnings: r.warnings };
}
