import type { PDFPage } from 'pdf-lib';
import { ToolError } from '@/lib/errors';
import { loadDocument } from '@/engines/pdf/load';
import { normalizeRotation, displaySize, type Box, type Rotation } from './geometry';

export type PageGeom = { box: Box; rotation: Rotation; width: number; height: number };

/** The visible area is the CropBox (MediaBox when there is none). */
export function pageGeom(page: PDFPage): PageGeom {
  const c = page.getCropBox();
  const box = { x0: c.x, y0: c.y, x1: c.x + c.width, y1: c.y + c.height };
  if (!(c.width > 0 && c.height > 0)) throw new ToolError('corrupt', 'A page in this PDF has no visible area.', 'Check that the file opens in a PDF reader.');
  const rotation = normalizeRotation(page.getRotation().angle);
  return { box, rotation, ...displaySize(box, rotation) };
}

export async function inspectSignPdf(bytes: Uint8Array): Promise<PageGeom[]> {
  const doc = await loadDocument(bytes);
  return doc.getPages().map(pageGeom);
}
