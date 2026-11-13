import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

// Needs a real HEIC file, which is not committed (no sample with a clear licence). Point PK_HEIC_SAMPLE at one:
//   PK_HEIC_SAMPLE=/path/to/photo.heic npx playwright test e2e/heic.spec.ts
const SAMPLE = process.env.PK_HEIC_SAMPLE ?? '';
test.skip(!SAMPLE || !existsSync(SAMPLE), 'set PK_HEIC_SAMPLE to a .heic file to run');

test('HEIC converts to PNG and to JPEG on this device, with a preview', async ({ page }) => {
  const external: string[] = [];
  await page.goto('/tools/convert');
  const origin = new URL(page.url()).origin;
  page.on('request', (r) => {
    if (!r.url().startsWith(origin) && !/^(blob|data):/.test(r.url())) external.push(r.url());
  });
  const heic = readFileSync(SAMPLE);
  await page.getByRole('main').locator('input[type=file]').first().setInputFiles({ name: 'IMG_0001.HEIC', mimeType: '', buffer: heic });
  await expect(page.getByRole('radio', { name: 'Images' })).toHaveAttribute('aria-checked', 'true');
  // Chromium cannot show HEIC itself, so the preview must come from the decoder.
  const preview = page.getByRole('img', { name: 'Preview of IMG_0001.HEIC' });
  await expect(preview).toBeVisible({ timeout: 60_000 });
  expect(await preview.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(100);

  const format = page.getByRole('combobox', { name: 'Output format' });
  await format.selectOption('image/png');
  await page.getByRole('button', { name: 'Convert', exact: true }).click();
  const art = page.getByRole('article', { name: 'IMG_0001.HEIC' });
  const pngBtn = art.getByRole('button', { name: /Download IMG_0001-converted\.png/ });
  await expect(pngBtn).toBeVisible({ timeout: 90_000 });
  const [d1] = await Promise.all([page.waitForEvent('download'), pngBtn.click()]);
  const png = PNG.sync.read(readFileSync((await d1.path())!));
  console.log(`HEIC -> PNG ${png.width}x${png.height}`);
  expect(png.width).toBeGreaterThan(100);
  expect(png.height).toBeGreaterThan(100);
  // Not a blank picture: sampled pixels are not all one colour.
  const seen = new Set<string>();
  for (let i = 0; i < png.data.length; i += 4 * 9973) seen.add(`${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`);
  expect(seen.size).toBeGreaterThan(20);

  await format.selectOption('image/jpeg');
  await page.getByRole('button', { name: 'Convert', exact: true }).click();
  const jpgBtn = art.getByRole('button', { name: /Download IMG_0001-converted\.jpg/ });
  await expect(jpgBtn).toBeVisible({ timeout: 90_000 });
  const [d2] = await Promise.all([page.waitForEvent('download'), jpgBtn.click()]);
  const jpg = readFileSync((await d2.path())!);
  expect(jpg.subarray(0, 3).toString('hex')).toBe('ffd8ff');
  const size = await page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/jpeg' }));
    return [bmp.width, bmp.height];
  }, jpg.toString('base64'));
  expect(size).toEqual([png.width, png.height]);
  expect(external).toEqual([]);
});

test('a damaged HEIC is refused with a clear message', async ({ page }) => {
  await page.goto('/tools/convert');
  const broken = Buffer.concat([readFileSync(SAMPLE).subarray(0, 600), Buffer.alloc(4000, 7)]);
  await page.getByRole('main').locator('input[type=file]').first().setInputFiles({ name: 'broken.heic', mimeType: '', buffer: broken });
  await page.getByRole('button', { name: 'Convert', exact: true }).click();
  await expect(page.getByRole('main').getByText(/HEIC file could not be decoded/).first()).toBeVisible({ timeout: 60_000 });
});
