import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';

export const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

/**
 * JPEG generated in the page with the browser's own encoder: a gradient plus seeded noise,
 * so it is not trivially compressible. Deterministic for the same size.
 * Call after page.goto() so an app origin exists.
 */
export async function makeJpeg(page: Page, width: number, height: number, quality = 0.95): Promise<Buffer> {
  const b64 = await page.evaluate(
    async ({ w, h, q }) => {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      const img = ctx.createImageData(w, h);
      const d = img.data;
      let seed = 12345;
      const rnd = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          d[i] = (x / w) * 255 + rnd() * 60;
          d[i + 1] = (y / h) * 255 + rnd() * 60;
          d[i + 2] = 128 + rnd() * 80 - 40;
          d[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg', quality: q })).arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    },
    { w: width, h: height, q: quality },
  );
  return Buffer.from(b64, 'base64');
}

/** PNG with a transparent right half (alpha ramps down), so transparency is real. */
export function makeTransparentPng(width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      png.data[i] = 30 + (x % 200);
      png.data[i + 1] = 120;
      png.data[i + 2] = 200 - (y % 150);
      png.data[i + 3] = x < width / 2 ? 255 : Math.max(0, 255 - Math.round(((x - width / 2) / (width / 2)) * 255));
    }
  }
  return PNG.sync.write(png);
}

/** Decodes bytes in the page with createImageBitmap, the independent check for output dimensions. */
export async function decodedSize(page: Page, bytes: Uint8Array, mime: string): Promise<{ w: number; h: number }> {
  return page.evaluate(
    async ({ b64, type }) => {
      const raw = atob(b64);
      const u8 = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([u8], { type }));
      const size = { w: bmp.width, h: bmp.height };
      bmp.close();
      return size;
    },
    { b64: Buffer.from(bytes).toString('base64'), type: mime },
  );
}
