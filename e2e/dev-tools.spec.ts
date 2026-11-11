import { expect, test } from '@playwright/test';
import { UTILS } from '../src/tools/dev-tools/catalog';

test('dev tools lists all 40 utilities and filters them', async ({ page }) => {
  await page.goto('/tools/dev-tools');
  const nav = page.getByRole('navigation', { name: 'Utilities' });
  await expect(nav.getByRole('link')).toHaveCount(40);
  await nav.getByLabel('Find a utility').fill('subnet');
  await expect(nav.getByRole('link')).toHaveCount(1);
});

for (const u of UTILS) {
  test(`utility ${u.id} renders, loads its example, and throws no page errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/tools/dev-tools?u=${u.id}`);
    await expect(page.getByRole('heading', { level: 2, name: u.name })).toBeVisible();
    await expect(page.getByText('Not built yet.')).toHaveCount(0);
    const example = page.getByRole('button', { name: /example/i }).first();
    if (await example.count()) await example.click();
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });
}

test('markdown preview strips scripts and event handlers', async ({ page }) => {
  await page.goto('/tools/dev-tools?u=markdown');
  await page.locator('textarea').first().fill('# Hi\n\n<script>window.__x=1</script><img src=x onerror="window.__x=2"><a href="javascript:window.__x=3">l</a>');
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as unknown as { __x?: number }).__x)).toBeUndefined();
  expect(await page.locator('main script, main [onerror], main a[href^="javascript:"]').count()).toBe(0);
});

test('jwt decoder always states the signature is not verified', async ({ page }) => {
  await page.goto('/tools/dev-tools?u=jwt');
  await expect(page.getByText(/signature is NOT verified/i)).toBeVisible();
});
