import { expect, test, type Download, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { decodedSize, makeJpeg, makeTransparentPng, sha256 } from './fixtures';

const pngSig = '89504e47';
async function readDownload(d: Download): Promise<Buffer> {
  return readFileSync((await d.path())!);
}
const hex = (b: Buffer, n: number) => b.subarray(0, n).toString('hex');

/** Adds a file through the real file input and waits until it appears in the Files list. */
async function upload(page: Page, name: string, mimeType: string, buffer: Buffer) {
  await page.locator('input[type=file]').first().setInputFiles({ name, mimeType, buffer });
  await expect(page.getByRole('button', { name: `Preview ${name}`, exact: true })).toBeVisible();
}

test.describe('image engine: Compress and Convert', () => {
  test('compress to WebP, download with real dimensions, hand off to Convert with no download', async ({ page }) => {
    await page.goto('/tools/compress');
    const jpeg = await makeJpeg(page, 1200, 800);
    await upload(page, 'photo.jpg', 'image/jpeg', jpeg);

    await page.getByRole('combobox', { name: 'Output format' }).selectOption('image/webp');
    await page.getByRole('slider', { name: 'Quality' }).fill('60');
    await page.getByRole('button', { name: 'Compress', exact: true }).click();

    const article = page.getByRole('article', { name: 'photo.jpg' });
    await expect(article.getByText(/−\d+(\.\d+)?%/)).toBeVisible({ timeout: 45_000 });

    // Download the result and verify it is really WebP with the same dimensions.
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download result' }).click()]);
    expect(dl.suggestedFilename()).toBe('photo-compressed.webp');
    const webp = await readDownload(dl);
    expect(webp.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(webp.subarray(8, 12).toString('ascii')).toBe('WEBP');
    expect(webp.length).toBeLessThan(jpeg.length);
    expect(await decodedSize(page, webp, 'image/webp')).toEqual({ w: 1200, h: 800 });

    // Original is still in the session, byte-identical to what was uploaded.
    const files = page.getByRole('region', { name: /^Files/ });
    const [orig] = await Promise.all([page.waitForEvent('download'), files.getByRole('button', { name: 'Download photo.jpg', exact: true }).click()]);
    const origBytes = await readDownload(orig);
    expect(origBytes.length).toBe(jpeg.length);
    expect(sha256(origBytes)).toBe(sha256(jpeg));

    // Use in… Convert: navigates with the file as input; no download or file chooser happens.
    let downloads = 0;
    let choosers = 0;
    page.on('download', () => downloads++);
    page.on('filechooser', () => choosers++);
    await article.getByRole('button', { name: /Use in/ }).first().click();
    await page.getByRole('menuitem', { name: /Convert/ }).click();
    await expect(page).toHaveURL(/\/tools\/convert$/);
    await expect(page.getByRole('button', { name: 'Preview photo-compressed.webp' })).toBeVisible();
    expect(downloads).toBe(0);
    expect(choosers).toBe(0);

    await page.getByRole('combobox', { name: 'Output format' }).selectOption('image/png');
    await page.getByRole('button', { name: 'Convert', exact: true }).click();
    const conv = page.getByRole('article', { name: 'photo-compressed.webp' });
    await expect(conv.getByRole('button', { name: /^Download/ })).toBeVisible({ timeout: 45_000 });
    const [pngDl] = await Promise.all([page.waitForEvent('download'), conv.getByRole('button', { name: /^Download/ }).click()]);
    const png = await readDownload(pngDl);
    expect(hex(png, 4)).toBe(pngSig);
    expect(pngDl.suggestedFilename()).toBe('photo-compressed-converted.png');
  });

  test('target size that cannot be reached says so and reports the smallest result', async ({ page }) => {
    await page.goto('/tools/compress');
    await upload(page, 'big.jpg', 'image/jpeg', await makeJpeg(page, 1200, 800));
    await page.getByRole('radio', { name: 'Target size' }).click();
    await page.getByRole('textbox', { name: 'Target size' }).fill('1');
    await page.getByRole('button', { name: 'Compress', exact: true }).click();
    await expect(page.getByText(/Could not reach 1\.00 KB\. Smallest achieved: /)).toBeVisible({ timeout: 45_000 });
  });

  test('cancel a large compress, then run it again on the same file', async ({ page }) => {
    await page.goto('/tools/compress');
    await upload(page, 'large.jpg', 'image/jpeg', await makeJpeg(page, 6000, 4000, 0.9));
    await page.getByRole('button', { name: 'Compress', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByText('Canceled', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Compress', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Download result' })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText('Files · 1')).toBeVisible();
  });

  test('transparent PNG to JPEG shows the flattening warning before converting', async ({ page }) => {
    await page.goto('/tools/convert');
    await upload(page, 'logo.png', 'image/png', makeTransparentPng(400, 300));
    await page.getByRole('combobox', { name: 'Output format' }).selectOption('image/jpeg');

    await expect(page.getByText(/Transparent areas will be filled with the background color/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Background color')).toBeVisible();

    await page.getByRole('button', { name: 'Convert', exact: true }).click();
    const article = page.getByRole('article', { name: 'logo.png' });
    const [dl] = await Promise.all([page.waitForEvent('download'), article.getByRole('button', { name: /^Download/ }).click()]);
    const out = await readDownload(dl);
    expect(hex(out, 3)).toBe('ffd8ff');
    expect(dl.suggestedFilename()).toBe('logo-converted.jpg');
  });
});
