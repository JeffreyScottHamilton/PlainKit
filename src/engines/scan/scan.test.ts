import { describe, expect, it } from 'vitest';
import { applyHomography, homographyFrom } from './homography';
import { outputSize, rotate, warpQuad } from './warp';
import { detectPage, fullPageQuad } from './corners';
import { adaptiveBinarize, applyFilter } from './filters';
import type { Pt, Quad, Raster } from './types';

function raster(w: number, h: number, fill: (x: number, y: number) => [number, number, number]): Raster {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fill(x, y);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  return { width: w, height: h, data };
}

const px = (r: Raster, x: number, y: number) => {
  const i = (y * r.width + x) * 4;
  return [r.data[i]!, r.data[i + 1]!, r.data[i + 2]!];
};

// Deterministic LCG so the noisy background is the same on every run.
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

describe('homography', () => {
  it('maps four known points exactly (within 1e-6)', () => {
    const src: Pt[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    const dst: Pt[] = [
      { x: 10, y: 12 },
      { x: 200, y: 30 },
      { x: 180, y: 220 },
      { x: 5, y: 190 },
    ];
    const H = homographyFrom(src, dst);
    for (let i = 0; i < 4; i++) {
      const p = applyHomography(H, src[i]!.x, src[i]!.y);
      expect(Math.abs(p.x - dst[i]!.x)).toBeLessThan(1e-6);
      expect(Math.abs(p.y - dst[i]!.y)).toBeLessThan(1e-6);
    }
  });

  it('warps a checkerboard quad to a rectangle whose corner colours match the quad corners', () => {
    // 40px cells. Quad corners sit on cell centres, so each corner's colour is unambiguous.
    const cell = (x: number, y: number): [number, number, number] => ((Math.floor(x / 40) + Math.floor(y / 40)) % 2 === 0 ? [250, 250, 250] : [20, 20, 20]);
    const img = raster(400, 320, cell);
    const q: Quad = [
      { x: 60, y: 60 },
      { x: 300, y: 100 },
      { x: 260, y: 260 },
      { x: 100, y: 220 },
    ];
    const out = warpQuad(img, q, 400);
    expect(out.width).toBeGreaterThan(0);
    const pick = (p: Pt) => cell(p.x, p.y);
    const inset = 2;
    expect(px(out, inset, inset)).toEqual(pick(q[0]!));
    expect(px(out, out.width - 1 - inset, inset)).toEqual(pick(q[1]!));
    expect(px(out, out.width - 1 - inset, out.height - 1 - inset)).toEqual(pick(q[2]!));
    expect(px(out, inset, out.height - 1 - inset)).toEqual(pick(q[3]!));
  });

  it('output size follows the average edge lengths and respects maxSide', () => {
    const q: Pt[] = [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 400 },
      { x: 0, y: 400 },
    ];
    expect(outputSize(q, 10_000)).toEqual({ width: 300, height: 400 });
    expect(outputSize(q, 200)).toEqual({ width: 150, height: 200 });
  });

  it('rotates clockwise by quarter turns', () => {
    const r = raster(2, 1, (x) => (x === 0 ? [1, 0, 0] : [0, 1, 0]));
    const turned = rotate(r, 1);
    expect(turned.width).toBe(1);
    expect(turned.height).toBe(2);
    expect(px(turned, 0, 0)).toEqual([1, 0, 0]);
    expect(px(turned, 0, 1)).toEqual([0, 1, 0]);
  });
});

describe('corner detection', () => {
  it('finds a rotated white quad on a dark noisy background within 3% of the diagonal', () => {
    const W = 400;
    const H = 300;
    const rnd = lcg(7);
    const truth: Pt[] = [
      { x: 120, y: 70 },
      { x: 330, y: 95 },
      { x: 300, y: 240 },
      { x: 90, y: 220 },
    ];
    // Point-in-convex-polygon test for the quad interior.
    const inside = (x: number, y: number) => {
      let sign = 0;
      for (let i = 0; i < 4; i++) {
        const a = truth[i]!;
        const b = truth[(i + 1) % 4]!;
        const c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
        if (c !== 0) {
          if (sign === 0) sign = Math.sign(c);
          else if (Math.sign(c) !== sign) return false;
        }
      }
      return true;
    };
    const img = raster(W, H, (x, y) => (inside(x, y) ? [235, 235, 232] : [30 + rnd() * 30, 30 + rnd() * 30, 30 + rnd() * 30]));
    const res = detectPage(img);
    expect(res.detected).toBe(true);
    const diag = Math.hypot(W, H);
    truth.forEach((t, i) => {
      const d = Math.hypot(res.quad[i]!.x * W - t.x, res.quad[i]!.y * H - t.y);
      expect(d).toBeLessThan(0.03 * diag);
    });
  });

  it('falls back to a full-image quad with an inset when nothing stands out', () => {
    const res = detectPage(raster(200, 200, () => [128, 128, 128]));
    expect(res.detected).toBe(false);
    expect(res.quad).toEqual(fullPageQuad());
  });
});

describe('adaptive black and white', () => {
  it('keeps text black and makes over 95% of paper pixels white under a strong shadow gradient', () => {
    const W = 600;
    const H = 800;
    // Paper shading runs from 35% (left) to 100% (right). Black text bars cover part of the page.
    const isText = (x: number, y: number) => (y % 60 >= 20 && y % 60 < 28 && x > 80 && x < 520) || (y % 150 >= 100 && y % 150 < 104 && x > 150 && x < 400);
    const shade = (x: number) => 0.35 + (0.65 * x) / W;
    const img = raster(W, H, (x, y) => (isText(x, y) ? [12, 12, 12] : [Math.round(240 * shade(x)), Math.round(240 * shade(x)), Math.round(236 * shade(x))]));
    const gray = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) gray[i] = img.data[i * 4]!;
    const bits = adaptiveBinarize(gray, W, H);
    let paper = 0;
    let paperWhite = 0;
    let textBlack = 0;
    let textTotal = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const v = bits[y * W + x]!;
        if (isText(x, y)) {
          textTotal++;
          if (v === 0) textBlack++;
        } else {
          paper++;
          if (v === 255) paperWhite++;
        }
      }
    expect(textBlack / textTotal).toBe(1);
    expect(paperWhite / paper).toBeGreaterThan(0.95);
  });

  it('enhanced filter turns a shaded blank page white', () => {
    const img = raster(120, 160, (x) => {
      const s = 0.4 + (0.6 * x) / 120;
      return [Math.round(200 * s), Math.round(200 * s), Math.round(200 * s)];
    });
    const out = applyFilter(img, 'enhanced');
    expect(px(out, 5, 5)[0]).toBeGreaterThan(240);
    expect(px(out, 110, 150)[0]).toBeGreaterThan(240);
  });
});
