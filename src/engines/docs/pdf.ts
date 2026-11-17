// Block model -> PDF with pdf-lib. Fonts are embedded (subset) from the bundled Noto Sans files. Pure apart from pdf-lib.
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { ToolError } from '@/lib/errors';
import { blockText, type Block } from './blocks';
import { CELL_PAD, findMissing, layoutBlocks, missingWarning, paginate, type Box, type LayoutCtx, type Metrics, type PreparedImage, type Piece, type Placed } from './layout';

export type FontSet = { regular: Uint8Array; bold: Uint8Array; italic: Uint8Array; boldItalic: Uint8Array };
export type PageSize = 'a4' | 'letter';
const SIZES: Record<PageSize, [number, number]> = { a4: [595.28, 841.89], letter: [612, 792] };
const MARGIN = 56.7; // 2 cm

const TEXT = rgb(0.1, 0.1, 0.1);
const LINK = rgb(0.07, 0.25, 0.6);
const RULE = rgb(0.7, 0.7, 0.7);
const QUOTE_BAR = rgb(0.6, 0.6, 0.6);
const HEADER_BG = rgb(0.93, 0.93, 0.93);

export type PdfResult = { bytes: Uint8Array; pages: number; warnings: string[] };

function imageSources(blocks: Block[], out: string[] = []): string[] {
  for (const b of blocks) {
    if (b.type === 'image') out.push(b.src);
    else if (b.type === 'table') b.rows.forEach((r) => r.forEach((c) => imageSources(c.blocks, out)));
  }
  return out;
}

function decodeDataUri(src: string): { mime: string; bytes: Uint8Array } | null {
  const m = /^data:(image\/[a-z+]+);base64,([\s\S]+)$/i.exec(src);
  if (!m) return null;
  const bin = atob(m[2]!.replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime: m[1]!.toLowerCase(), bytes };
}

export async function blocksToPdf(blocks: Block[], fonts: FontSet, size: PageSize): Promise<PdfResult> {
  const warnings: string[] = [];
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const embed = (b: Uint8Array) => doc.embedFont(b, { subset: true });
  const faces = { regular: await embed(fonts.regular), bold: await embed(fonts.bold), italic: await embed(fonts.italic), boldItalic: await embed(fonts.boldItalic) };
  const face = (bold: boolean, italic: boolean): PDFFont => (bold && italic ? faces.boldItalic : bold ? faces.bold : italic ? faces.italic : faces.regular);

  const text = blockText(blocks);
  const coverage = fontkit.create(fonts.regular) as { hasGlyphForCodePoint(cp: number): boolean };
  const missing = missingWarning(findMissing(text, (cp) => coverage.hasGlyphForCodePoint(cp)), false);
  if (missing) warnings.push(missing);

  // Pictures: only PNG and JPEG can be embedded without a decoder. Others are reported and left out.
  const images = new Map<string, PreparedImage>();
  const pdfImages = new Map<string, PDFImage>();
  let skipped = 0;
  for (const src of imageSources(blocks)) {
    if (images.has(src)) continue;
    const d = decodeDataUri(src);
    let img: PDFImage | undefined;
    try {
      if (d?.mime === 'image/png') img = await doc.embedPng(d.bytes);
      else if (d?.mime === 'image/jpeg' || d?.mime === 'image/jpg') img = await doc.embedJpg(d.bytes);
    } catch {
      img = undefined;
    }
    if (!img) {
      skipped++;
      continue;
    }
    const key = String(pdfImages.size);
    pdfImages.set(key, img);
    images.set(src, { key, width: img.width, height: img.height });
  }
  if (skipped) warnings.push(`${skipped} picture${skipped === 1 ? ' was' : 's were'} left out: only PNG and JPEG pictures can be placed in a PDF.`);

  const [W, H] = SIZES[size];
  const contentW = W - 2 * MARGIN;
  const contentH = H - 2 * MARGIN;
  const metrics: Metrics = { width: (t, st, sz) => face(st.bold, st.italic).widthOfTextAtSize(t, sz) };
  const ctx: LayoutCtx = { metrics, images, maxImageHeight: contentH };
  const pages = paginate(layoutBlocks(blocks, contentW, ctx), contentH);

  const pieceFont = (p: Piece) => face(p.bold, p.italic);

  // (x, y) is the top-left corner of the box in page points, measured from the top-left of the page.
  function drawBox(page: PDFPage, box: Box, x: number, y: number): void {
    const bottom = H - y - box.height;
    if (box.kind === 'line') {
      const baseline = H - y - box.size;
      const lx = x + box.x;
      for (const p of box.pieces) {
        const isLink = !!p.href;
        page.drawText(p.text, { x: lx + p.x, y: baseline, size: box.size, font: pieceFont(p), color: isLink ? LINK : TEXT });
        if (p.underline || isLink) page.drawLine({ start: { x: lx + p.x, y: baseline - 1.5 }, end: { x: lx + p.x + p.w, y: baseline - 1.5 }, thickness: 0.6, color: isLink ? LINK : TEXT });
        if (p.strike) page.drawLine({ start: { x: lx + p.x, y: baseline + box.size * 0.3 }, end: { x: lx + p.x + p.w, y: baseline + box.size * 0.3 }, thickness: 0.6, color: TEXT });
      }
      if (box.marker) page.drawText(box.marker.text, { x: x + box.marker.x, y: baseline, size: box.size, font: faces.regular, color: TEXT });
      if (box.bar !== undefined) page.drawLine({ start: { x: x + box.bar, y: H - y }, end: { x: x + box.bar, y: bottom }, thickness: 1.5, color: QUOTE_BAR });
    } else if (box.kind === 'image') {
      const img = pdfImages.get(box.image.key);
      if (img) page.drawImage(img, { x: x + box.x, y: bottom, width: box.width, height: box.height });
    } else if (box.kind === 'rule') {
      const my = bottom + box.height / 2;
      page.drawLine({ start: { x: x + box.x, y: my }, end: { x: x + box.x + box.width, y: my }, thickness: 0.5, color: RULE });
    } else if (box.kind === 'row') {
      const rowX = x + box.x;
      for (const c of box.cells) {
        const cx = rowX + c.x;
        page.drawRectangle({ x: cx, y: bottom, width: c.w, height: box.height, color: c.header ? HEADER_BG : undefined, borderColor: RULE, borderWidth: 0.5 });
        drawStack(page, c.boxes, cx + CELL_PAD, y + CELL_PAD);
      }
    }
  }

  function drawStack(page: PDFPage, boxes: Box[], x: number, y: number): void {
    let cur = y;
    boxes.forEach((b, i) => {
      if (i > 0) cur += Math.max(boxes[i - 1]!.after, b.before);
      drawBox(page, b, x, cur);
      cur += b.height;
    });
  }

  for (const placed of pages as Placed[][]) {
    const page = doc.addPage([W, H]);
    for (const p of placed) drawBox(page, p.box, MARGIN, MARGIN + p.y);
  }
  if (pages.length === 0) doc.addPage([W, H]);

  const bytes = await doc.save();
  // Reopen the bytes with an independent reader before handing them back.
  const check = await PDFDocument.load(bytes, { updateMetadata: false });
  if (check.getPageCount() < 1) throw new ToolError('verify', 'The PDF could not be checked after writing.', 'Try again, or export as Markdown or text instead.');
  return { bytes, pages: check.getPageCount(), warnings };
}
