/** Pure geometry for the ID photo tool. No DOM, no canvas. */

export type Rect = { x: number; y: number; w: number; h: number };
/** Crop centre and zoom in source-image pixels. zoom 1 = the largest crop that fits the image. */
export type Pan = { cx: number; cy: number; zoom: number };

export const MAX_ZOOM = 4;
export type Dpi = 300 | 600;
export const DPI_OPTIONS: Dpi[] = [300, 600];

export const mmToPx = (mm: number, dpi: number): number => Math.round((mm / 25.4) * dpi);
export const mmToPt = (mm: number): number => (mm / 25.4) * 72;
export const pxToMm = (px: number, dpi: number): number => (px / dpi) * 25.4;

/** Output pixel size of a photo at a DPI. */
export function outputPx(widthMm: number, heightMm: number, dpi: number): { w: number; h: number } {
  return { w: mmToPx(widthMm, dpi), h: mmToPx(heightMm, dpi) };
}

/** Paper sizes in portrait orientation (short side first). Photos are never scaled to fit. */
export type Paper = { id: string; name: string; wMm: number; hMm: number };
export const PAPERS: Paper[] = [
  { id: '4x6', name: '4 × 6 in', wMm: 101.6, hMm: 152.4 },
  { id: 'a4', name: 'A4', wMm: 210, hMm: 297 },
  { id: 'letter', name: 'US Letter', wMm: 215.9, hMm: 279.4 },
  { id: '10x15', name: '10 × 15 cm', wMm: 100, hMm: 150 },
];

/** Largest centred rectangle with the given aspect (w/h) inside the image. */
export function fitCrop(imgW: number, imgH: number, aspect: number): Rect {
  const w = Math.min(imgW, imgH * aspect);
  const h = w / aspect;
  return { x: (imgW - w) / 2, y: (imgH - h) / 2, w, h };
}

export const defaultPan = (imgW: number, imgH: number): Pan => ({ cx: imgW / 2, cy: imgH / 2, zoom: 1 });

/**
 * Clamps zoom and centre so the crop stays inside the image.
 * allowOutside lets the crop centre reach the image edge, so part of the crop may fall outside
 * (the renderer fills that area with the background colour).
 */
export function clampPan(pan: Pan, imgW: number, imgH: number, aspect: number, allowOutside = false): Pan {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, pan.zoom));
  const base = fitCrop(imgW, imgH, aspect);
  const cw = base.w / zoom;
  const ch = base.h / zoom;
  const lo = (size: number) => (allowOutside ? 0 : size / 2);
  const cx = Math.min(imgW - lo(cw), Math.max(lo(cw), pan.cx));
  const cy = Math.min(imgH - lo(ch), Math.max(lo(ch), pan.cy));
  return { cx, cy, zoom };
}

/** Crop rectangle in source pixels for a pan. Always has the preset aspect. */
export function cropRect(imgW: number, imgH: number, aspect: number, pan: Pan, allowOutside = false): Rect {
  const p = clampPan(pan, imgW, imgH, aspect, allowOutside);
  const base = fitCrop(imgW, imgH, aspect);
  const w = base.w / p.zoom;
  const h = base.h / p.zoom;
  return { x: p.cx - w / 2, y: p.cy - h / 2, w, h };
}

/** Eye-line band as fractions of output height measured from the TOP. Null when the preset has no range. */
export function eyeLineBand(heightMm: number, range: [number, number] | undefined): { top: number; bottom: number } | null {
  if (!range) return null;
  const [lo, hi] = range;
  return { top: 1 - hi / heightMm, bottom: 1 - lo / heightMm };
}

/** Head-size band as fractions of output height measured from the BOTTOM (a size scale, not a position). */
export function headBand(heightMm: number, range: [number, number] | undefined): { from: number; to: number } | null {
  if (!range) return null;
  return { from: range[0] / heightMm, to: range[1] / heightMm };
}

export type SheetOptions = { marginMm?: number; gapMm?: number };
export type Sheet = { orientation: 'portrait' | 'landscape'; cols: number; rows: number; count: number; positions: { xMm: number; yMm: number }[] };

function grid(pageW: number, pageH: number, photoW: number, photoH: number, margin: number, gap: number) {
  const uw = pageW - 2 * margin;
  const uh = pageH - 2 * margin;
  const cols = uw < photoW ? 0 : Math.floor((uw + gap) / (photoW + gap));
  const rows = uh < photoH ? 0 : Math.floor((uh + gap) / (photoH + gap));
  return { cols, rows };
}

/**
 * How many photos of the given physical size fit on a sheet, trying both paper orientations.
 * Ties go to portrait. Positions are top-left corners in mm.
 */
export function layoutSheet(paper: Paper, photo: { wMm: number; hMm: number }, opts: SheetOptions = {}): Sheet {
  const margin = opts.marginMm ?? 5;
  const gap = opts.gapMm ?? 3;
  const portrait = grid(paper.wMm, paper.hMm, photo.wMm, photo.hMm, margin, gap);
  const landscape = grid(paper.hMm, paper.wMm, photo.wMm, photo.hMm, margin, gap);
  const useLandscape = landscape.cols * landscape.rows > portrait.cols * portrait.rows;
  const g = useLandscape ? landscape : portrait;
  const positions: { xMm: number; yMm: number }[] = [];
  for (let r = 0; r < g.rows; r++)
    for (let c = 0; c < g.cols; c++)
      positions.push({ xMm: margin + c * (photo.wMm + gap), yMm: margin + r * (photo.hMm + gap) });
  return { orientation: useLandscape ? 'landscape' : 'portrait', cols: g.cols, rows: g.rows, count: positions.length, positions };
}

/** Page size in mm for the chosen orientation. */
export function pageMm(paper: Paper, orientation: Sheet['orientation']): { wMm: number; hMm: number } {
  return orientation === 'landscape' ? { wMm: paper.hMm, hMm: paper.wMm } : { wMm: paper.wMm, hMm: paper.hMm };
}

/** Parses a typed custom size in mm. Null when it is not a number from min to max. */
export function parseMm(s: string, min = 5, max = 300): number | null {
  const t = s.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
}
