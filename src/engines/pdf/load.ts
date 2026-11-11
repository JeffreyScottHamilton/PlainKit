import { PDFDocument } from 'pdf-lib';
import { ToolError } from '@/lib/errors';

export type PageInfo = { width: number; height: number; rotation: number };
export type PdfInfo = { pageCount: number; pages: PageInfo[] };

const SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const SIGNATURE_SCAN = 1024; // the header may follow some leading junk

export function hasPdfSignature(bytes: Uint8Array): boolean {
  const last = Math.min(bytes.length, SIGNATURE_SCAN) - SIGNATURE.length;
  for (let i = 0; i <= last; i++) if (SIGNATURE.every((b, j) => bytes[i + j] === b)) return true;
  return false;
}

export const corruptError = () => new ToolError('corrupt', 'This file could not be read as a PDF.', 'Check that the file opens in a PDF reader.');
export const encryptedError = () =>
  new ToolError('encrypted', 'This PDF is password-protected.', 'Remove the password in a PDF reader first, then try again.');

/** Only probes on the failure path: pdf-lib's EncryptedPDFError fails instanceof under its ES5 build. */
async function isEncrypted(bytes: Uint8Array): Promise<boolean> {
  try {
    return (await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })).isEncrypted;
  } catch {
    return false;
  }
}

/** Loads without ignoreEncryption, so password-protected files are refused rather than silently edited. */
export async function loadDocument(bytes: Uint8Array): Promise<PDFDocument> {
  if (!hasPdfSignature(bytes)) throw corruptError();
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch {
    if (await isEncrypted(bytes)) throw encryptedError();
    throw corruptError();
  }
  if (doc.getPageCount() === 0) throw corruptError();
  return doc;
}

export async function inspectPdf(bytes: Uint8Array): Promise<PdfInfo> {
  const doc = await loadDocument(bytes);
  const pages = doc.getPages().map((p) => {
    const { width, height } = p.getSize();
    return { width, height, rotation: p.getRotation().angle };
  });
  return { pageCount: pages.length, pages };
}
