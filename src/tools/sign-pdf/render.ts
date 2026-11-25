import type { PDFDocumentProxy } from 'pdfjs-dist';

// pdf.js loads only when this tool opens (its own chunk).
type PdfJs = typeof import('pdfjs-dist');
let lib: Promise<PdfJs> | undefined;
function loadLib(): Promise<PdfJs> {
  lib ??= import('pdfjs-dist').then((m) => {
    m.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
    return m;
  });
  return lib;
}

/** Opens a document for drawing pages. Call `close` when done; it frees the document and worker state. */
export async function openSignDoc(blob: Blob): Promise<{ pdf: PDFDocumentProxy; close: () => Promise<void> }> {
  const { getDocument } = await loadLib();
  const task = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  const pdf = await task.promise;
  return { pdf, close: () => task.destroy() };
}

const urls = new WeakMap<Blob, string>();

/** Object URL for a mark or image blob, created once per blob. */
export function blobUrl(blob: Blob): string {
  let u = urls.get(blob);
  if (!u) {
    u = URL.createObjectURL(blob);
    urls.set(blob, u);
  }
  return u;
}
