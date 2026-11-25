import { expect, test, type Page } from '@playwright/test';
import QRCode from 'qrcode';

const main = (page: Page) => page.locator('.pk-tool__main');
const URL_TEXT = 'https://example.com/a?utm_source=x';
const WIFI_TEXT = 'WIFI:T:WPA;S:Cafe Net;P:hunter-two-pass;;';
const WIFI_PASSWORD = 'hunter-two-pass';

/** PNG fixtures generated in node with the qrcode package, so the browser decodes a real code. */
const qrPng = (text: string) => QRCode.toBuffer(text, { errorCorrectionLevel: 'M', margin: 4, scale: 8 });

test('QR Scan: a URL code is shown with its host, nothing opens, and the password rule holds for Wi-Fi', async ({ page }) => {
  await page.goto('/tools/qr-code');
  await expect(page.getByRole('heading', { level: 1, name: 'QR code' })).toBeVisible();
  // Make mode is still the default.
  await expect(main(page).getByRole('radiogroup', { name: 'Content type' })).toBeVisible();

  await main(page).getByRole('radiogroup', { name: 'Mode' }).getByRole('radio', { name: 'Scan' }).click();
  await expect(main(page).getByRole('radiogroup', { name: 'Content type' })).toHaveCount(0);

  // URL code from an uploaded image.
  const contexts = page.context();
  await main(page).locator('input[type="file"]').setInputFiles({ name: 'url.png', mimeType: 'image/png', buffer: await qrPng(URL_TEXT) });
  await expect(main(page).locator('.qr-text')).toHaveText(URL_TEXT);
  await expect(main(page).locator('.qr-host')).toHaveText('example.com');
  // Opening is the user's choice: the link is a plain anchor with safe rel, and the page did not navigate.
  const open = main(page).getByRole('link', { name: 'Open in a new tab' });
  await expect(open).toHaveAttribute('href', URL_TEXT);
  await expect(open).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(open).toHaveAttribute('target', '_blank');
  expect(contexts.pages()).toHaveLength(1);
  await expect(page).toHaveURL(/\/tools\/qr-code$/);

  // Wi-Fi code: SSID shown, password hidden until the user asks for it.
  await main(page).getByRole('button', { name: 'Scan another' }).click();
  await main(page).locator('input[type="file"]').setInputFiles({ name: 'wifi.png', mimeType: 'image/png', buffer: await qrPng(WIFI_TEXT) });
  await expect(main(page).getByText('Cafe Net')).toBeVisible();
  await expect(main(page).getByText(WIFI_PASSWORD)).toHaveCount(0);
  await main(page).getByRole('button', { name: 'Show password' }).click();
  await expect(main(page).getByText(WIFI_PASSWORD)).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Copy password' })).toBeVisible();
  await expect(page).toHaveURL(/\/tools\/qr-code$/);
});
