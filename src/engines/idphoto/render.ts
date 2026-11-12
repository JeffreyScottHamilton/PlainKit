import { PDFDocument, rgb } from 'pdf-lib';
import { ToolError } from '@/lib/errors';
import { sniffBlob } from '@/engines/image/sniff';
import { mmToPt, outputPx, pageMm, type Dpi, type Paper, type Rect, type Sheet } from './geometry';

/** Input guards. Images are parsed from user files, so dimensions are capped before any allocation. */
export const MAX_SOURCE_SIDE = 10000;
export const MAX_SOURCE_PIXELS = 60_000_000;
const JPEG_QUALITY = 0.95;
const CUT_GAP_MM = 1;
const CUT_LEN_MM = 3;

/** Pure: throws when a decoded source is too large to crop safely. */
export function assertSourceSize(w: number, h: number): void {
  if (w > MAX_SOURCE_SIDE || h > MAX_SOURCE_SIDE || w * h > MAX_SOURCE_PIXELS)
    throw new ToolError('image-too-large', `This image is ${w} × ${h} px, which is too large to crop here.`, 'Resize the photo to under 4000 px on the long side and try again.');
}

/** Checks the file content (magic bytes), decodes with EXIF orientation applied, and caps its size. */
export async function decodeSource(blob: Blob): Promise<ImageBitmap> {
  if ((await sniffBlob(blob)) === null)
    throw new ToolError('not-an-image', 'This file is not a JPEG, PNG, or WebP image.', 'Choose a JPEG, PNG or WebP photo.');
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    throw new ToolError('decode-failed', 'The browser could not decode this image.', 'Try a different photo, or re-save it as JPEG.');
  }
  try {
    assertSourceSize(bmp.width, bmp.height);
  } catch (e) {
    bmp.close();
    throw e;
  }
  return bmp;
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
}

/** Writes the print density into the JFIF APP0 header, when present. Pixel size is unaffected. */
export function setJfifDensity(bytes: Uint8Array, dpi: number): void {
  const isJfif = bytes[2] === 0xff && bytes[3] === 0xe0 && String.fromCharCode(...bytes.subarray(6, 11)) === 'JFIF\0';
  if (!isJfif) return;
  bytes[13] = 1; // units: dots per inch
  bytes[14] = dpi >> 8;
  bytes[15] = dpi & 0xff;
  bytes[16] = dpi >> 8;
  bytes[17] = dpi & 0xff;
}

/** Draws the crop at exactly the preset's pixel size (mm at DPI) and encodes JPEG. Outside-image area is white. */
export async function renderPhoto(bmp: ImageBitmap, crop: Rect, size: { wMm: number; hMm: number }, dpi: Dpi): Promise<Blob> {
  const { w, h } = outputPx(size.wMm, size.hMm, dpi);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ToolError('canvas-unavailable', 'This browser cannot draw the photo.', 'Try a current version of Chrome, Edge, Firefox or Safari.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
  const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
  const bytes = new Uint8Array(await out.arrayBuffer());
  if (!isJpeg(bytes)) throw new ToolError('encode-unsupported', 'This browser could not write JPEG.', 'Try a different browser.');
  setJfifDensity(bytes, dpi);
  return new Blob([bytes], { type: 'image/jpeg' });
}

function drawCutMarks(page: { drawLine: (o: { start: { x: number; y: number }; end: { x: number; y: number }; thickness: number; color: ReturnType<typeof rgb> }) => void }, x0: number, y0: number, x1: number, y1: number) {
  const black = rgb(0, 0, 0);
  const t = 0.25;
  for (const x of [x0, x1]) for (const y of [y0, y1]) {
    const dx = x === x0 ? -1 : 1;
    const dy = y === y0 ? -1 : 1;
    const g = mmToPt(CUT_GAP_MM);
    const l = mmToPt(CUT_LEN_MM);
    page.drawLine({ start: { x: x + dx * g, y }, end: { x: x + dx * l, y }, thickness: t, color: black });
    page.drawLine({ start: { x, y: y + dy * g }, end: { x, y: y + dy * l }, thickness: t, color: black });
  }
}

/**
 * Places the photo JPEG on a PDF page at its exact physical size (mm -> pt), never scaled.
 * Reloads the output and checks page count and size before returning.
 */
export async function renderSheet(jpeg: Uint8Array, photo: { wMm: number; hMm: number }, paper: Paper, sheet: Sheet, cutMarks: boolean): Promise<Blob> {
  if (sheet.count === 0)
    throw new ToolError('photo-too-large-for-paper', 'This photo does not fit on the chosen paper.', 'Choose a larger paper size.');
  const { wMm, hMm } = pageMm(paper, sheet.orientation);
  const pageW = mmToPt(wMm);
  const pageH = mmToPt(hMm);
  const doc = await PDFDocument.create();
  const page = doc.addPage([pageW, pageH]);
  const img = await doc.embedJpg(jpeg);
  const w = mmToPt(photo.wMm);
  const h = mmToPt(photo.hMm);
  for (const pos of sheet.positions) {
    const x = mmToPt(pos.xMm);
    const yTop = mmToPt(pos.yMm);
    const y = pageH - yTop - h;
    page.drawImage(img, { x, y, width: w, height: h });
    if (cutMarks) drawCutMarks(page, x, y, x + w, y + h);
  }
  const bytes = new Uint8Array(await doc.save());
  await verifySheet(bytes, pageW, pageH);
  return new Blob([bytes], { type: 'application/pdf' });
}

/** Reloads the PDF with an independent parse: one page, size matches the requested paper in points. */
export async function verifySheet(bytes: Uint8Array, pageW: number, pageH: number): Promise<void> {
  const back = await PDFDocument.load(bytes);
  const pages = back.getPages();
  const { width, height } = pages[0]?.getSize() ?? { width: 0, height: 0 };
  const ok = pages.length === 1 && Math.abs(width - pageW) < 0.01 && Math.abs(height - pageH) < 0.01;
  if (!ok) throw new ToolError('pdf-verify-failed', 'The print sheet did not verify.', 'Try again, or export the single photo instead.');
}
