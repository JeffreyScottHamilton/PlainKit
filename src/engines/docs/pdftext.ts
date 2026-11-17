// PDF text layer -> plain text with pdf.js. Scanned pages have no text layer and are reported, not guessed at.
import { ToolError } from '@/lib/errors';

type PdfJs = typeof import('pdfjs-dist');
let lib: Promise<PdfJs> | undefined;
function loadLib(): Promise<PdfJs> {
  lib ??= import('pdfjs-dist').then((m) => {
    // A real nested worker. The fake worker runs in this worker's own global scope and posts a handshake to the page.
    m.GlobalWorkerOptions.workerPort = new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' });
    return m;
  });
  return lib;
}

export async function pdfToText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const pdfjs = await loadLib();
  let doc: Awaited<ReturnType<PdfJs['getDocument']>['promise']>;
  try {
    doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  } catch (e) {
    const name = e instanceof Error ? e.name : '';
    if (name === 'PasswordException') throw new ToolError('encrypted', 'This PDF is password protected.', 'Remove the password first, then try again.');
    throw new ToolError('corrupt', 'This file could not be read as a PDF.', 'Check that the file opens in a PDF reader.');
  }
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let s = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      s += item.str;
      if (item.hasEOL) s += '\n';
    }
    pages.push(s.trim());
  }
  return { text: pages.filter(Boolean).join('\n\n'), pages: doc.numPages };
}
