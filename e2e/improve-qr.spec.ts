import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';

const main = (page: Page) => page.locator('.pk-tool__main');

test('QR email: a mailto code with a subject downloads as a PNG that decodes to the same mailto', async ({ page }) => {
  await page.goto('/tools/qr-code');
  await expect(page.getByRole('heading', { level: 1, name: 'QR code' })).toBeVisible();
  await main(page).getByRole('radiogroup', { name: 'Content type' }).getByRole('radio', { name: 'Email' }).click();
  await main(page).getByLabel('Email address').fill('ada@example.com');
  await main(page).getByLabel('Subject (optional)').fill('Hi there');
  await expect(main(page).getByText('Checked: decodes to the same content.')).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent('download'), main(page).getByRole('button', { name: 'Download PNG' }).click()]);
  const png = PNG.sync.read(readFileSync((await download.path())!));
  const rgba = new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length);
  expect(jsQR(rgba, png.width, png.height)?.data).toBe('mailto:ada@example.com?subject=Hi%20there');
});

test('QR phone: an invalid number explains the problem and disables download', async ({ page }) => {
  await page.goto('/tools/qr-code');
  await main(page).getByRole('radiogroup', { name: 'Content type' }).getByRole('radio', { name: 'Phone' }).click();
  await main(page).getByLabel('Phone number').fill('call me');
  await expect(main(page).getByText('Enter a phone number with digits, such as +1 555 0100.')).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Download PNG' })).toBeDisabled();
});
