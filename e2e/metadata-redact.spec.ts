import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import exifr from 'exifr';
import { jpegWithMetadata } from '../src/engines/metadata/testdata';
import { listSegments } from '../src/engines/metadata/segments';

const W = 800;
const H = 600;
const R = { x: 300, y: 200, w: 200, h: 100 };

/** White 800x600 PNG with a 200x100 block at (300,200): red and blue 1px columns. Generated in the page. */
async function makeStripedPng(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(
    async ({ w, h, r }) => {
      const c = new OffscreenCanvas(w, h);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      for (let x = r.x; x < r.x + r.w; x++) {
        ctx.fillStyle = x % 2 === 0 ? '#ff0000' : '#0000ff';
        ctx.fillRect(x, r.y, 1, r.h);
      }
      const bytes = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    },
    { w: W, h: H, r: R },
  );
  return Buffer.from(b64, 'base64');
}

const px = (png: PNG, x: number, y: number) => {
  const i = (y * png.width + x) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
};

/** Export starts a job; the file is downloaded from the result's "Download result" button. */
async function exportAndRead(page: Page): Promise<PNG> {
  const main = page.getByRole('main');
  await main.getByRole('button', { name: 'Export redacted image', exact: true }).click();
  const result = main.getByRole('button', { name: 'Download result', exact: true });
  await expect(result).toBeVisible({ timeout: 45_000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), result.click()]);
  return PNG.sync.read(readFileSync((await dl.path())!));
}

test.describe('Redact', () => {
  test('solid and pixelate exports are flattened and match the region', async ({ page }) => {
    await page.goto('/tools/redact');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.locator('input[type=file]').first().setInputFiles({ name: 'scan.png', mimeType: 'image/png', buffer: await makeStripedPng(page) });
    const main = page.getByRole('main');
    await expect(main.getByRole('application', { name: /Redaction canvas for scan\.png/ })).toBeVisible();

    await main.getByRole('button', { name: 'Add region', exact: true }).click();
    await main.getByRole('spinbutton', { name: 'Width' }).fill(String(R.w));
    await main.getByRole('spinbutton', { name: 'Height' }).fill(String(R.h));
    await main.getByRole('spinbutton', { name: 'X' }).fill(String(R.x));
    await main.getByRole('spinbutton', { name: 'Y' }).fill(String(R.y));
    await main.getByRole('radio', { name: 'Solid', exact: true }).click();

    const solid = await exportAndRead(page);
    expect([solid.width, solid.height]).toEqual([W, H]);
    for (let y = R.y; y < R.y + R.h; y += 3) for (let x = R.x; x < R.x + R.w; x += 3) expect(px(solid, x, y)).toEqual([0, 0, 0, 255]);
    expect(px(solid, R.x - 1, R.y)).toEqual([255, 255, 255, 255]);
    expect(px(solid, R.x + R.w, R.y + 5)).toEqual([255, 255, 255, 255]);
    let reds = 0;
    for (let i = 0; i < solid.data.length; i += 4) if (solid.data[i] === 255 && solid.data[i + 1] === 0 && solid.data[i + 2] === 0) reds++;
    expect(reds).toBe(0);

    // Pixelate: block = max(8, round(min(w,h)/8)) = 13. Each block is one flat colour, so no 1px stripes remain.
    await main.getByRole('radio', { name: 'Pixelate', exact: true }).click();
    const pix = await exportAndRead(page);
    const block = 13;
    for (let y = R.y; y < R.y + R.h; y += 4) {
      for (let x = R.x; x < R.x + R.w; x++) {
        const start = R.x + Math.floor((x - R.x) / block) * block;
        expect(px(pix, x, y)).toEqual(px(pix, start, y));
        expect(px(pix, x, y)).not.toEqual([255, 0, 0, 255]);
        expect(px(pix, x, y)).not.toEqual([0, 0, 255, 255]);
      }
    }
    expect(px(pix, R.x - 1, R.y)).toEqual([255, 255, 255, 255]);
    expect([pix.width, pix.height]).toEqual([W, H]);
  });
});

test.describe('Metadata', () => {
  test('location warning shows, removal drops GPS and EXIF/XMP and verifies', async ({ page }) => {
    await page.goto('/tools/metadata');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const jpeg = jpegWithMetadata({ gps: true, xmp: true });
    await page.locator('input[type=file]').first().setInputFiles({ name: 'geo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg) });
    const main = page.getByRole('main');
    await expect(main.getByText('This photo contains a location.')).toBeVisible();

    // Keep rotation is on by default and keeps an orientation-only EXIF block. Turn it off to remove all EXIF.
    await main.getByRole('checkbox', { name: /Keep rotation/ }).uncheck();
    const [dl] = await Promise.all([page.waitForEvent('download'), main.getByRole('button', { name: 'Remove metadata', exact: true }).click().then(async () => {
      await expect(main.getByText('Verified: no EXIF, GPS, XMP or IPTC found in the output')).toBeVisible({ timeout: 45_000 });
      await main.getByRole('button', { name: 'Download geo-clean.jpg' }).click();
    })]);
    const out = readFileSync((await dl.path())!);
    expect(dl.suggestedFilename()).toBe('geo-clean.jpg');
    expect(await exifr.parse(out, { gps: true, tiff: true, exif: true, xmp: true })).toBeUndefined();
    const kinds = listSegments(new Uint8Array(out)).segments.map((s) => s.kind);
    expect(kinds).not.toContain('exif');
    expect(kinds).not.toContain('xmp');
  });
});
