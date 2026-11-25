// Page geometry for placing items. Display space is what the viewer shows: CropBox size, after /Rotate
// (clockwise), origin at the top-left, units in points. PDF user space has its origin at the bottom-left.

export type Box = { x0: number; y0: number; x1: number; y1: number };
export type Rotation = 0 | 90 | 180 | 270;
export type Pt = { x: number; y: number };

export function normalizeRotation(angle: number): Rotation {
  return (((Math.round(angle / 90) * 90) % 360 + 360) % 360) as Rotation;
}

export function displaySize(box: Box, rot: Rotation): { width: number; height: number } {
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  return rot === 90 || rot === 270 ? { width: h, height: w } : { width: w, height: h };
}

/** Display point (top-left origin, points) to PDF user space. */
export function displayToUser(box: Box, rot: Rotation, p: Pt): Pt {
  const H = box.y1 - box.y0;
  switch (rot) {
    case 0:
      return { x: box.x0 + p.x, y: box.y1 - p.y };
    case 90:
      return { x: box.x0 + p.y, y: box.y1 - (H - p.x) };
    case 180:
      return { x: box.x1 - p.x, y: box.y0 + p.y };
    case 270:
      return { x: box.x1 - p.y, y: box.y1 - p.x };
  }
}

/** Inverse of displayToUser. */
export function userToDisplay(box: Box, rot: Rotation, p: Pt): Pt {
  switch (rot) {
    case 0:
      return { x: p.x - box.x0, y: box.y1 - p.y };
    case 90:
      return { x: p.y - box.y0, y: p.x - box.x0 };
    case 180:
      return { x: box.x1 - p.x, y: p.y - box.y0 };
    case 270:
      return { x: box.y1 - p.y, y: box.x1 - p.x };
  }
}
