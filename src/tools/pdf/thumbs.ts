import type { PDFDocumentProxy } from 'pdfjs-dist';

// pdfjs is loaded only when this tool opens (its own chunk). Documents are opened once per source
// and destroyed when the tool unmounts.
type PdfJs = typeof import('pdfjs-dist');
let lib: Promise<PdfJs> | undefined;
function loadLib(): Promise<PdfJs> {
  lib ??= import('pdfjs-dist').then((m) => {
    m.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
    return m;
  });
  return lib;
}

type Opened = { doc: Promise<PDFDocumentProxy>; destroy: () => Promise<void> };
const docs = new Map<string, Promise<Opened>>();

export function openDoc(srcId: string, blob: Blob): Promise<PDFDocumentProxy> {
  let p = docs.get(srcId);
  if (!p) {
    p = (async () => {
      const { getDocument } = await loadLib();
      const data = new Uint8Array(await blob.arrayBuffer());
      const task = getDocument({ data });
      return { doc: task.promise, destroy: () => task.destroy() };
    })();
    docs.set(srcId, p);
    // A failed open is retried on the next render, not cached forever.
    p.catch(() => docs.delete(srcId));
  }
  return p.then((o) => o.doc);
}

/** Destroys every open document (on tool unmount). Thumbnails reopen on demand. */
export function releaseDocs() {
  for (const p of docs.values()) void p.then((o) => o.destroy(), () => undefined);
  docs.clear();
}
