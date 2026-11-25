import { expect, test } from '@playwright/test';
import { makeJpeg } from './fixtures';

test('compress target presets set the size and the pressed state, then a compress run finishes', async ({ page }) => {
  await page.goto('/tools/compress');
  await page.locator('input[type=file]').first().setInputFiles({ name: 'photo.jpg', mimeType: 'image/jpeg', buffer: await makeJpeg(page, 1200, 800) });
  await page.getByRole('radio', { name: 'Target size' }).click();

  const oneMb = page.getByRole('button', { name: '1 MB', exact: true });
  await oneMb.click();
  await expect(oneMb).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('textbox', { name: 'Target size' })).toHaveValue('1');
  await expect(page.getByRole('combobox', { name: 'Target size unit' })).toHaveValue('MB');
  await expect(page.getByRole('button', { name: '500 KB', exact: true })).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: 'Compress', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download result' })).toBeVisible({ timeout: 60_000 });
});
