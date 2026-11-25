import { describe, expect, it } from 'vitest';
import { displaySize, displayToUser, normalizeRotation, userToDisplay, type Box, type Pt, type Rotation } from './geometry';

// Offset CropBox: the origin is not (0,0), so mapping must use the box, not the page origin.
const box: Box = { x0: 20, y0: 30, x1: 320, y1: 430 }; // 300 x 400 visible
const ROTS: Rotation[] = [0, 90, 180, 270];
const close = (a: Pt, b: Pt) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe('display <-> user space', () => {
  it('swaps width and height for 90 and 270 only', () => {
    expect(displaySize(box, 0)).toEqual({ width: 300, height: 400 });
    expect(displaySize(box, 90)).toEqual({ width: 400, height: 300 });
    expect(displaySize(box, 180)).toEqual({ width: 300, height: 400 });
    expect(displaySize(box, 270)).toEqual({ width: 400, height: 300 });
  });

  it('round-trips every point for every rotation', () => {
    for (const rot of ROTS) {
      const { width, height } = displaySize(box, rot);
      for (const p of [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: 0, y: height },
        { x: width, y: height },
        { x: width * 0.3, y: height * 0.7 },
      ]) {
        close(userToDisplay(box, rot, displayToUser(box, rot, p)), p);
      }
    }
  });

  it('puts the display top-left on the expected PDF corner for each rotation', () => {
    // Unrotated page: top-left of the view is user (x0, y1).
    close(displayToUser(box, 0, { x: 0, y: 0 }), { x: 20, y: 430 });
    // /Rotate 90 is clockwise on screen: the view's top-left is the page's bottom-left, user (x0, y0).
    close(displayToUser(box, 90, { x: 0, y: 0 }), { x: 20, y: 30 });
    close(displayToUser(box, 180, { x: 0, y: 0 }), { x: 320, y: 30 });
    close(displayToUser(box, 270, { x: 0, y: 0 }), { x: 320, y: 430 });
  });

  it('normalizes any multiple of 90, including negatives', () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(-180)).toBe(180);
  });
});

describe('upright placement', () => {
  // Images and text are drawn rotated by the page's /Rotate about their bottom-left point.
  // Here the unit axes are rotated the same way, so the item's rect must land exactly on the display rect.
  for (const rot of ROTS) {
    it(`an item drawn with rotate ${rot} lands on its display rectangle`, () => {
      const x = 40;
      const y = 60;
      const w = 90;
      const h = 30;
      const origin = displayToUser(box, rot, { x, y: y + h });
      const t = (rot * Math.PI) / 180;
      const toUser = (lx: number, ly: number) => ({ x: origin.x + lx * Math.cos(t) - ly * Math.sin(t), y: origin.y + lx * Math.sin(t) + ly * Math.cos(t) });
      // Local corners: bottom-left (0,0), bottom-right (w,0), top-left (0,h).
      close(userToDisplay(box, rot, toUser(0, 0)), { x, y: y + h });
      close(userToDisplay(box, rot, toUser(w, 0)), { x: x + w, y: y + h });
      close(userToDisplay(box, rot, toUser(0, h)), { x, y });
    });
  }
});
