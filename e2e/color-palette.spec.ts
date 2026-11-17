import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

// Three exact bands: red 50%, green 30%, blue 20% (left to right). Every pixel is one of three colors.
function bandsPng(): Buffer {
  const w = 100;
  const h = 60;
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [r, g, b] = x < 50 ? [255, 0, 0] : x < 80 ? [0, 255, 0] : [0, 0, 255];
      png.data.set([r, g, b, 255], i);
    }
  }
  return PNG.sync.write(png);
}

async function openWithBands(page: Page) {
  await page.goto('/tools/color-palette');
  await page.locator('input[type=file]').first().setInputFiles({ name: 'bands.png', mimeType: 'image/png', buffer: bandsPng() });
  await expect(page.locator('.cp-value')).toHaveText(['#ff0000', '#00ff00', '#0000ff']);
}

test.describe('Color palette', () => {
  test('extracts exact colors with their shares', async ({ page }) => {
    await openWithBands(page);
    await expect(page.locator('.cp-meta').nth(0)).toContainText('50.0% of picture');
    await expect(page.locator('.cp-meta').nth(1)).toContainText('30.0% of picture');
    await expect(page.locator('.cp-meta').nth(2)).toContainText('20.0% of picture');
    await page.getByRole('radio', { name: '3' }).click();
    await expect(page.locator('.cp-value')).toHaveCount(3);
  });

  test('switches the display format to RGB and HSL', async ({ page }) => {
    await openWithBands(page);
    await page.getByRole('radio', { name: 'RGB' }).click();
    await expect(page.locator('.cp-value').first()).toHaveText('rgb(255, 0, 0)');
    await page.getByRole('radio', { name: 'HSL' }).click();
    await expect(page.locator('.cp-value').nth(1)).toHaveText('hsl(120, 100%, 50%)');
  });

  test('clicking a swatch copies its HEX with visible feedback', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openWithBands(page);
    await page.getByRole('button', { name: 'Copy #00ff00' }).click();
    await expect(page.getByText('Copied', { exact: false }).first()).toBeVisible();
    await expect(page.locator('.cp-note')).toHaveText('Copied #00ff00.');
  });

  test('picks a color by clicking the picture, after removing one', async ({ page }) => {
    await openWithBands(page);
    await page.getByRole('button', { name: 'Remove #0000ff' }).click();
    await expect(page.locator('.cp-value')).toHaveCount(2);
    const canvas = page.locator('canvas.cp-canvas');
    await expect(canvas).toHaveCSS('cursor', 'crosshair');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await canvas.click({ position: { x: box!.width * 0.95, y: box!.height / 2 } });
    await expect(page.locator('.cp-note')).toHaveText('Added #0000ff.');
    await expect(page.locator('.cp-value')).toHaveText(['#ff0000', '#00ff00', '#0000ff']);
  });

  test('edits a swatch with HSL text and rejects invalid text', async ({ page }) => {
    await openWithBands(page);
    await page.getByRole('button', { name: 'Edit #00ff00' }).click();
    const text = page.getByLabel('HEX, RGB or HSL');
    await text.fill('#zzz');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(text).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Use #rrggbb, rgb(r, g, b) or hsl(h, s%, l%).')).toBeVisible();
    await text.fill('hsl(120, 100%, 25%)');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.cp-value')).toHaveText(['#ff0000', '#008000', '#0000ff']);
  });

  test('removes a swatch', async ({ page }) => {
    await openWithBands(page);
    await page.getByRole('button', { name: 'Remove #ff0000' }).click();
    await expect(page.locator('.cp-value')).toHaveText(['#00ff00', '#0000ff']);
  });

  test('exports a PNG that really is a PNG of the palette', async ({ page }) => {
    await openWithBands(page);
    await page.getByRole('button', { name: 'Export PNG' }).click();
    const download = page.getByRole('button', { name: 'Download PNG' });
    await expect(download).toBeVisible();
    const [dl] = await Promise.all([page.waitForEvent('download'), download.click()]);
    expect(dl.suggestedFilename()).toBe('bands-palette.png');
    const bytes = readFileSync((await dl.path())!);
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const decoded = PNG.sync.read(bytes);
    expect(decoded.width).toBe(720);
    expect(decoded.height).toBe(3 * 120 + 48);
  });

  test('downloads the CSS variables file', async ({ page }) => {
    await openWithBands(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download .css' }).click()]);
    expect(dl.suggestedFilename()).toBe('bands-palette.css');
    const text = readFileSync((await dl.path())!, 'utf8');
    expect(text).toBe(':root {\n  --color-1: #ff0000;\n  --color-2: #00ff00;\n  --color-3: #0000ff;\n}\n');
  });

  test('a corrupt file gets an explicit error with a next step', async ({ page }) => {
    await page.goto('/tools/color-palette');
    const broken = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 0x17)]);
    await page.locator('input[type=file]').first().setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: broken });
    await expect(page.getByRole('alert')).toContainText('could not be decoded');
    await expect(page.getByRole('alert')).toContainText('Try another file.');
  });

  test('390px: no horizontal page scroll and touch targets of at least 44px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWithBands(page);
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scroll).toBeLessThanOrEqual(390);
    const canvasBox = await page.locator('canvas.cp-canvas').boundingBox();
    expect(canvasBox!.width).toBeLessThanOrEqual(390 - 32);
    for (const name of ['Edit #00ff00', 'Remove #00ff00', 'Copy #00ff00']) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box!.height, name).toBeGreaterThanOrEqual(44);
      expect(box!.width, name).toBeGreaterThanOrEqual(44);
    }
  });
});
