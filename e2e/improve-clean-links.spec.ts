import { expect, test, type Page } from '@playwright/test';

const main = (page: Page) => page.locator('.pk-tool__main');

test('clean links: a Google redirect is unwrapped and cleaned, and a sentence with two links gives two numbered results', async ({ page }) => {
  await page.goto('/tools/clean-links');
  await expect(page.getByRole('heading', { level: 1, name: 'Clean links' })).toBeVisible();
  const wrapped = 'https://www.google.com/url?q=https%3A%2F%2Fex.com%2Fp%3Futm_source%3Dx%26id%3D1&sa=D';
  const sentence = 'See https://a.com/?utm_source=x and www.b.org/?fbclid=1.';
  await main(page).getByLabel('URLs, one per line').fill(`${wrapped}\n${sentence}`);

  // The wrapper is never fetched: the destination comes from its own q= parameter.
  await expect(main(page).getByText('Taken from the redirect on www.google.com. The real destination is cleaned here.')).toBeVisible();
  await expect(main(page).getByText('https://ex.com/p?id=1', { exact: true })).toBeVisible();

  // Mixed text: each link on line 2 is its own result, labelled by its number on the line.
  await expect(main(page).getByRole('heading', { name: 'Line 2, link 1' })).toBeVisible();
  await expect(main(page).getByRole('heading', { name: 'Line 2, link 2' })).toBeVisible();
  await expect(main(page).getByText('https://www.b.org/', { exact: true })).toBeVisible();
  await expect(main(page).getByText('3 links · 3 with parameters removed · 1 unwrapped from redirects')).toBeVisible();
  await expect(main(page).getByRole('button', { name: 'Copy all cleaned' })).toBeVisible();
});
