import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

// 200 × 100 gradient so every crop and resize has real content.
function gradientPng(w = 200, h = 100): Buffer {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      png.data[i] = (x * 2) & 255;
      png.data[i + 1] = (y * 9) & 255;
      png.data[i + 2] = 128;
      png.data[i + 3] = 255;
    }
  return PNG.sync.write(png);
}

const grad = { name: 'grad.png', mimeType: 'image/png', buffer: gradientPng() };

async function upload(page: Page) {
  await page.goto('/tools/resize');
  await page.getByRole('main').locator('input[type=file]').first().setInputFiles(grad);
}

async function runAndDownload(page: Page) {
  await page.getByRole('button', { name: 'Resize', exact: true }).click();
  const btn = page.getByRole('article', { name: grad.name }).getByRole('button', { name: /Download grad-resized\.png/ });
  await expect(btn).toBeVisible({ timeout: 30_000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), btn.click()]);
  const bytes = readFileSync((await dl.path())!);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test('exact width and height give the typed pixel size', async ({ page }) => {
  await upload(page);
  await page.getByRole('textbox', { name: 'Width (px)' }).fill('32');
  await page.getByRole('textbox', { name: 'Height (px)' }).fill('24');
  expect(await runAndDownload(page)).toEqual({ width: 32, height: 24 });
});

test('1:1 crop then fit 50 gives a square', async ({ page }) => {
  await upload(page);
  await page.getByRole('combobox', { name: 'Crop shape' }).selectOption('1:1');
  await page.getByRole('radio', { name: 'Fit within' }).click();
  await page.getByRole('textbox', { name: 'Longest side (px)' }).fill('50');
  await page.getByRole('button', { name: 'Resize', exact: true }).click();
  const btn = page.getByRole('article', { name: grad.name }).getByRole('button', { name: /Download grad-resized\.png/ });
  await expect(btn).toBeVisible({ timeout: 30_000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), btn.click()]);
  const bytes = readFileSync((await dl.path())!);
  expect(bytes.readUInt32BE(16)).toBe(bytes.readUInt32BE(20));
});

test('rotate right swaps width and height', async ({ page }) => {
  await upload(page);
  await page.getByRole('button', { name: 'Rotate right' }).click();
  await page.getByRole('radio', { name: 'Fit within' }).click();
  await page.getByRole('textbox', { name: 'Longest side (px)' }).fill('50');
  await page.getByRole('button', { name: 'Resize', exact: true }).click();
  const btn = page.getByRole('article', { name: grad.name }).getByRole('button', { name: /Download grad-resized\.png/ });
  await expect(btn).toBeVisible({ timeout: 30_000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), btn.click()]);
  const bytes = readFileSync((await dl.path())!);
  expect({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }).toEqual({ width: 25, height: 50 });
});
