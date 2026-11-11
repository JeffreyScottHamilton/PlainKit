// Preview <-> image mapping for an image shown letterboxed (fit inside a box, centred).

export type Layout = { scale: number; offsetX: number; offsetY: number };

/** Scale and centring offsets that fit an image of imgW x imgH inside a box of boxW x boxH. */
export function fitLayout(imgW: number, imgH: number, boxW: number, boxH: number): Layout {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  return { scale, offsetX: (boxW - imgW * scale) / 2, offsetY: (boxH - imgH * scale) / 2 };
}

export const toPreview = (l: Layout, x: number, y: number): { x: number; y: number } => ({ x: x * l.scale + l.offsetX, y: y * l.scale + l.offsetY });
export const toImage = (l: Layout, px: number, py: number): { x: number; y: number } => ({ x: (px - l.offsetX) / l.scale, y: (py - l.offsetY) / l.scale });
