import { expect, test } from '@playwright/test';
import exifr from 'exifr';
import { readFileSync } from 'node:fs';
import { jpegWithMetadata } from '../src/engines/metadata/testdata';

test('Metadata: location badge shows before removal; summary reports GPS and camera after removal', async ({ page }) => {
  await page.goto('/tools/metadata');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const main = page.getByRole('main');
  const jpeg = jpegWithMetadata({ gps: true });
  await main.locator('input[type=file]').first().setInputFiles({ name: 'trip.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg) });

  await expect(main.getByText('Has location data', { exact: true })).toBeVisible();
  await expect(main.getByText('This photo contains a location.')).toBeVisible();

  await main.getByRole('button', { name: 'Remove metadata', exact: true }).click();
  await expect(main.getByText(/^Verified:/)).toBeVisible({ timeout: 45_000 });
  const summary = main.locator('.meta-summary');
  await expect(summary).toContainText('Removed from this file: GPS location yes');
  await expect(summary).toContainText('Camera TestCam');

  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    main.getByRole('button', { name: 'Download trip-clean.jpg' }).click(),
  ]);
  const out = readFileSync((await dl.path())!);
  expect(await exifr.gps(out)).toBeUndefined();
});
