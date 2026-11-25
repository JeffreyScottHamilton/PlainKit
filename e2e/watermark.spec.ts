import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

// 200 × 100 solid dark grey: any white pixel drawn on it is easy to detect.
function solidPng(w: number, h: number, rgb: [number, number, number]): Buffer {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    png.data[i * 4] = rgb[0];
    png.data[i * 4 + 1] = rgb[1];
    png.data[i * 4 + 2] = rgb[2];
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

const base = { name: 'solid.png', mimeType: 'image/png', buffer: solidPng(200, 100, [40, 40, 40]) };
const logo = { name: 'logo.png', mimeType: 'image/png', buffer: solidPng(40, 20, [220, 30, 30]) };

function decode(path: string): PNG {
  return PNG.sync.read(readFileSync(path));
}

/** Pixel at (x, y) as "r,g,b". */
function px(img: PNG, x: number, y: number): string {
  const i = (y * img.width + x) * 4;
  return `${img.data[i]},${img.data[i + 1]},${img.data[i + 2]}`;
}

/** True when any pixel in the box differs from the original background. */
function changedIn(img: PNG, x0: number, y0: number, x1: number, y1: number, bg: string): boolean {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (px(img, x, y) !== bg) return true;
  return false;
}

async function runAndDownload(page: Page, name: string, outName: string): Promise<string> {
  await page.getByRole('button', { name: 'Watermark', exact: true }).click();
  const btn = page.getByRole('article', { name }).getByRole('button', { name: `Download ${outName}` });
  await expect(btn).toBeVisible({ timeout: 30_000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), btn.click()]);
  return (await dl.path())!;
}

test('text watermark keeps size and changes only the bottom-right corner', async ({ page }) => {
  await page.goto('/tools/watermark');
  await page.getByRole('main').locator('input[type=file]').first().setInputFiles(base);
  await page.getByRole('textbox', { name: 'Text' }).fill('Hello');
  await page.getByRole('spinbutton', { name: 'Size (% of shorter side)' }).fill('20');
  await page.getByRole('button', { name: 'Bottom right' }).click();
  // White text on dark grey, default colour.
  const out = decode(await runAndDownload(page, base.name, 'solid-watermarked.png'));
  expect(out.width).toBe(200);
  expect(out.height).toBe(100);
  expect(changedIn(out, 140, 70, 200, 100, '40,40,40')).toBe(true);
  expect(changedIn(out, 0, 0, 40, 30, '40,40,40')).toBe(false);
});

test('logo watermark in tiled mode keeps size and draws tiles', async ({ page }) => {
  await page.goto('/tools/watermark');
  await page.getByRole('main').locator('input[type=file]').first().setInputFiles(base);
  await page.getByRole('radio', { name: 'Logo' }).click();
  await page.locator('.wm-logo input[type=file]').setInputFiles(logo);
  await page.getByRole('radio', { name: 'Tiled pattern' }).click();
  await page.getByRole('spinbutton', { name: 'Size (% of shorter side)' }).fill('15');
  const out = decode(await runAndDownload(page, base.name, 'solid-watermarked.png'));
  expect(out.width).toBe(200);
  expect(out.height).toBe(100);
  expect(changedIn(out, 0, 0, 200, 100, '40,40,40')).toBe(true);
});
