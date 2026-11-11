// Test fixtures built in memory with pdf-lib. Not imported by the app.
import { degrees, PDFDocument, StandardFonts } from 'pdf-lib';
import type { PageRef } from './model';

export type PageSpec = { width: number; height?: number; rotate?: number; text?: string };

/** Each page has its width (and optional text) so order and size are checkable after export. */
export async function makePdf(pages: PageSpec[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const spec of pages) {
    const page = doc.addPage([spec.width, spec.height ?? 300]);
    if (spec.rotate) page.setRotation(degrees(spec.rotate));
    if (spec.text) page.drawText(spec.text, { x: 20, y: 20, size: 18, font });
  }
  return doc.save();
}

/** Widths in document order, plus rotation: the check every export test uses. */
export async function readPages(bytes: Uint8Array): Promise<{ width: number; height: number; rotation: number }[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return doc.getPages().map((p) => {
    const { width, height } = p.getSize();
    return { width, height, rotation: p.getRotation().angle };
  });
}

/** Builds a PageRef list for a source. Keys are unique per call. */
export function refsFor(srcId: string, count: number, prefix = srcId): PageRef[] {
  return Array.from({ length: count }, (_, i) => ({ key: `${prefix}:${i}`, srcId, srcIndex: i, rotation: 0 as const }));
}

/**
 * A real PDF whose trailer has /Encrypt (Standard security handler, dummy keys). Generated once with
 * correct xref offsets so pdf-lib recognises it as encrypted, not corrupt.
 */
export const ENCRYPTED_PDF_B64 =
  'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAyMDAgMjAwXSA+PgplbmRvYmoKNCAwIG9iago8PCAvRmlsdGVyIC9TdGFuZGFyZCAvViAxIC9SIDIgL08gPDAwMTEyMjMzNDQ1NTY2Nzc4ODk5YWFiYmNjZGRlZWZmMDAxMTIyMzM0NDU1NjY3Nzg4OTlhYWJiY2NkZGVlZmY+IC9VIDwwMDExMjIzMzQ0NTU2Njc3ODg5OWFhYmJjY2RkZWVmZjAwMTEyMjMzNDQ1NTY2Nzc4ODk5YWFiYmNjZGRlZWZmPiAvUCAtNCA+PgplbmRvYmoKeHJlZgowIDUKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMTg2IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNSAvUm9vdCAxIDAgUiAvRW5jcnlwdCA0IDAgUiA+PgpzdGFydHhyZWYKMzgxCiUlRU9GCg==';
export const encryptedPdf = (): Uint8Array => Uint8Array.from(atob(ENCRYPTED_PDF_B64), (c) => c.charCodeAt(0));
