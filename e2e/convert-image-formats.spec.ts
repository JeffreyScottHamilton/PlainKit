import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

// A small PNG with a gradient so encoders have real content to work on.
function gradientPng(w = 64, h = 48): Buffer {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      png.data[i] = (x * 4) & 255;
      png.data[i + 1] = (y * 5) & 255;
      png.data[i + 2] = 128;
      png.data[i + 3] = 255;
    }
  return PNG.sync.write(png);
}

const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#ff0000"/><circle cx="60" cy="40" r="30" fill="#0000ff"/></svg>',
);

async function convert(page: Page, file: { name: string; mimeType: string; buffer: Buffer }, target: string, outName: RegExp) {
  await page.goto('/tools/convert');
  await page.getByRole('main').locator('input[type=file]').first().setInputFiles(file);
  await page.getByRole('combobox', { name: 'Output format' }).selectOption(target);
  await page.getByRole('button', { name: 'Convert', exact: true }).click();
  const btn = page.getByRole('article', { name: file.name }).getByRole('button', { name: outName });
  await expect(btn).toBeVisible({ timeout: 30_000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), btn.click()]);
  return readFileSync((await dl.path())!);
}

const png = { name: 'grad.png', mimeType: 'image/png', buffer: gradientPng() };

test('PNG → GIF writes a GIF89a', async ({ page }) => {
  const out = await convert(page, png, 'image/gif', /Download grad-converted\.gif/);
  expect(out.subarray(0, 6).toString('latin1')).toBe('GIF89a');
  expect(out.readUInt16LE(6)).toBe(64);
  expect(out.readUInt16LE(8)).toBe(48);
});

test('PNG → BMP writes a 24-bit bitmap of the right size', async ({ page }) => {
  const out = await convert(page, png, 'image/bmp', /Download grad-converted\.bmp/);
  expect(out.subarray(0, 2).toString('latin1')).toBe('BM');
  expect(out.readInt32LE(18)).toBe(64);
  expect(Math.abs(out.readInt32LE(22))).toBe(48);
  expect(out.readUInt16LE(28)).toBe(24);
});

test('PNG → TIFF writes a little-endian TIFF', async ({ page }) => {
  const out = await convert(page, png, 'image/tiff', /Download grad-converted\.tiff?/);
  expect(out.subarray(0, 4).toString('hex')).toMatch(/^(49492a00|4d4d002a)$/);
});

test('PNG → ICO writes an icon with a PNG inside', async ({ page }) => {
  const out = await convert(page, png, 'image/x-icon', /Download grad-converted\.ico/);
  expect(out.readUInt16LE(0)).toBe(0);
  expect(out.readUInt16LE(2)).toBe(1);
  expect(out.readUInt16LE(4)).toBe(1);
  const offset = out.readUInt32LE(18);
  expect(out.subarray(offset, offset + 4).toString('hex')).toBe('89504e47');
});

test('SVG → PNG rasterises the drawing', async ({ page }) => {
  const out = await convert(page, { name: 'shape.svg', mimeType: 'image/svg+xml', buffer: SVG }, 'image/png', /Download shape-converted\.png/);
  const img = PNG.sync.read(out);
  expect(img.width).toBeGreaterThanOrEqual(120);
  const centre = ((img.height >> 1) * img.width + (img.width >> 1)) * 4;
  expect(img.data[centre + 2]).toBeGreaterThan(200); // blue circle in the middle
  expect(img.data[4 * 2]).toBeGreaterThan(200); // red corner
});

test('TIFF → JPEG round trip decodes the TIFF', async ({ page }) => {
  const tiff = await convert(page, png, 'image/tiff', /Download grad-converted\.tiff?/);
  const out = await convert(page, { name: 'grad.tif', mimeType: 'image/tiff', buffer: tiff }, 'image/jpeg', /Download grad-converted\.jpe?g/);
  expect(out.subarray(0, 3).toString('hex')).toBe('ffd8ff');
});
