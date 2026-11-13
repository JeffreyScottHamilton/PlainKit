import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';

// Scope every interaction to the tool's own area so the session tray's "Download <name>" buttons never match.
const main = (page: Page) => page.locator('.pk-tool__main');

async function openTool(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
}

test('clean links removes utm params, keeps others, and leaves a signed link untouched', async ({ page }) => {
  await openTool(page, '/tools/clean-links', 'Clean links');
  const signed = 'https://bucket.example.com/f.pdf?X-Amz-Signature=abc&utm_medium=mail';
  await main(page).getByLabel('URLs, one per line').fill(`https://ex.com/a?utm_source=news&id=7#top\n${signed}`);

  await expect(main(page).getByText('https://ex.com/a?id=7#top', { exact: true })).toBeVisible();
  await expect(main(page).getByText('This looks like a signed link. Changing it can break it.')).toBeVisible();
  // Signed link: original and cleaned both show the untouched URL.
  await expect(main(page).getByText(signed, { exact: true })).toHaveCount(2);
});

test('clean text removes a zero-width space and keeps the family emoji', async ({ page }) => {
  await openTool(page, '/tools/clean-text', 'Clean text');
  const family = '\u{1F468}‍\u{1F469}‍\u{1F467}';
  await main(page).getByLabel('Text to check').fill(`Hello​world ${family}`);

  await expect(main(page).getByLabel('Output')).toHaveValue(`Helloworld ${family}`);
  await expect(main(page).getByText('This cannot prove text was written by AI and does not remove every kind of watermark.')).toBeVisible();
});

test('QR code: a typed URL downloads as a PNG that decodes to the same content', async ({ page }) => {
  await openTool(page, '/tools/qr-code', 'QR code');
  const url = 'https://example.org/e2e-check?lang=en&ref=qr';
  await main(page).getByLabel('Text or URL').fill(url);
  await expect(main(page).getByText('Checked: decodes to the same content.')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    main(page).getByRole('button', { name: 'Download PNG' }).click(),
  ]);
  const path = await download.path();
  expect(path).toBeTruthy();
  const png = PNG.sync.read(readFileSync(path!));
  const rgba = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length);
  expect(jsQR(rgba, png.width, png.height)?.data).toBe(url);
});

test('keep awake: enable shows Active or a clear error, and Stop returns to Released', async ({ page }) => {
  await openTool(page, '/tools/keep-awake', 'Keep awake');
  const start = main(page).getByRole('button', { name: 'Keep screen awake' });
  if (await start.isDisabled()) {
    await expect(main(page).getByText('This browser does not support Screen Wake Lock.')).toBeVisible();
    return;
  }
  await start.click();

  const stop = main(page).getByRole('button', { name: 'Stop' });
  const refused = main(page).getByText('Could not keep the screen awake.');
  await expect(stop.or(refused)).toBeVisible();

  if (await stop.isVisible()) {
    await expect(main(page).locator('.ka-state')).toHaveText('Active');
    await stop.click();
  }
  await expect(main(page).locator('.ka-state')).toHaveText('Released');
});

test('keep awake: with permission it holds a real lock, survives leaving the tool, and Stop releases it', async ({ page, context, baseURL }) => {
  await context.grantPermissions(['screen-wake-lock' as never], { origin: baseURL });
  await openTool(page, '/tools/keep-awake', 'Keep awake');
  await main(page).getByRole('button', { name: 'Keep screen awake' }).click();
  await expect(main(page).locator('.ka-state')).toHaveText('Active');
  // The lock belongs to the app, not the page component: going to another tool and back keeps it.
  await page.getByRole('navigation', { name: 'Tools' }).getByRole('link', { name: 'QR code' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'QR code' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Tools' }).getByRole('link', { name: 'Keep awake' }).click();
  await expect(main(page).locator('.ka-state')).toHaveText('Active');
  await main(page).getByRole('button', { name: 'Stop' }).click();
  await expect(main(page).locator('.ka-state')).toHaveText('Released');
});

test('keep awake: a refused request says so plainly', async ({ page }) => {
  await openTool(page, '/tools/keep-awake', 'Keep awake');
  const start = main(page).getByRole('button', { name: 'Keep screen awake' });
  test.skip(await start.isDisabled(), 'no Screen Wake Lock in this browser');
  await start.click();
  const refused = main(page).getByText('Could not keep the screen awake.');
  const stop = main(page).getByRole('button', { name: 'Stop' });
  await expect(refused.or(stop)).toBeVisible();
  if (await refused.isVisible()) await expect(main(page).getByText('Not active: the request was refused.')).toBeVisible();
});
