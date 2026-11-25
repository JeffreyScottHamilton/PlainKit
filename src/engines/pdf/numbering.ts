import { degrees, rgb, StandardFonts, type PDFDocument, type PDFPage } from 'pdf-lib';

/** Page number text stamped at the bottom centre of each exported page. */
export type NumberStyle = 'none' | 'number' | 'page-of';

export const NUMBER_STYLES: { value: NumberStyle; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'number', label: '1' },
  { value: 'page-of', label: 'Page 1 of N' },
];

export const NUMBER_MARGIN = 24;
export const NUMBER_SIZE = 9;

/** The text for page `index` (1-based) of `total` pages in the exported file, or null for no numbers. */
export function numberLabel(style: NumberStyle, index: number, total: number): string | null {
  if (style === 'none') return null;
  return style === 'number' ? String(index) : `Page ${index} of ${total}`;
}

export type Rotation = 0 | 90 | 180 | 270;
export type Point = { x: number; y: number };
export type Size = { w: number; h: number };

/** Normalises a /Rotate angle to 0, 90, 180 or 270. Anything else (never written by this tool) reads as 0. */
export function rotationOf(deg: number): Rotation {
  const r = ((deg % 360) + 360) % 360;
  return r === 90 || r === 180 || r === 270 ? r : 0;
}

/** Displayed size: 90 and 270 swap width and height. `s` is the unrotated media size. */
export function displaySize(s: Size, r: Rotation): Size {
  return r === 90 || r === 270 ? { w: s.h, h: s.w } : s;
}

/**
 * Where an unrotated (PDF user space) point appears on the page after /Rotate is applied.
 * /Rotate turns the page clockwise. `s` is the unrotated media size.
 */
export function toDisplay(p: Point, s: Size, r: Rotation): Point {
  switch (r) {
    case 0:
      return p;
    case 90:
      return { x: p.y, y: s.w - p.x };
    case 180:
      return { x: s.w - p.x, y: s.h - p.y };
    case 270:
      return { x: s.h - p.y, y: p.x };
  }
}

/** Inverse of toDisplay: a point on the displayed page back to unrotated user space. */
export function toRaw(p: Point, s: Size, r: Rotation): Point {
  switch (r) {
    case 0:
      return p;
    case 90:
      return { x: s.w - p.y, y: p.x };
    case 180:
      return { x: s.w - p.x, y: s.h - p.y };
    case 270:
      return { x: p.y, y: s.h - p.x };
  }
}

/**
 * Where a label of `textWidth` starts so it is centred on the displayed bottom edge, in unrotated coordinates,
 * with the angle (counter-clockwise, as pdf-lib draws it) that makes it read upright on the rotated page.
 */
export function stampLayout(s: Size, r: Rotation, textWidth: number, margin = NUMBER_MARGIN): { x: number; y: number; angle: number } {
  const d = displaySize(s, r);
  const start = { x: d.w / 2 - textWidth / 2, y: margin };
  const anchor = toRaw(start, s, r);
  const along = toRaw({ x: start.x + 1, y: start.y }, s, r);
  const deg = (Math.atan2(along.y - anchor.y, along.x - anchor.x) * 180) / Math.PI;
  return { x: anchor.x, y: anchor.y, angle: (deg + 360) % 360 };
}

/** Draws the page numbers on the given pages of `doc` (already in their output order). Pages are not re-rendered. */
export async function stampNumbers(doc: PDFDocument, pages: readonly PDFPage[], style: NumberStyle): Promise<void> {
  if (style === 'none' || pages.length === 0) return;
  const font = await doc.embedFont(StandardFonts.Helvetica);
  pages.forEach((page, i) => {
    const label = numberLabel(style, i + 1, pages.length);
    if (label === null) return;
    const { width, height } = page.getSize();
    const r = rotationOf(page.getRotation().angle);
    const at = stampLayout({ w: width, h: height }, r, font.widthOfTextAtSize(label, NUMBER_SIZE));
    page.drawText(label, { x: at.x, y: at.y, size: NUMBER_SIZE, font, color: rgb(0.25, 0.25, 0.25), rotate: degrees(at.angle) });
  });
}
