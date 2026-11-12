import { expect, test, type Page } from '@playwright/test';
import { makeJpeg } from './fixtures';

// Offline behaviour of the PRODUCTION build (service worker + CSP). Skipped against a dev server.
test.skip(Boolean(process.env.PK_BASE_URL), 'needs the production build served by `npm run preview`');

async function swReady(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
  });
}

async function compress(page: Page, name: string) {
  const jpeg = await makeJpeg(page, 800, 600);
  await page.locator('input[type=file]').first().setInputFiles({ name, mimeType: 'image/jpeg', buffer: jpeg });
  await page.getByRole('button', { name: /^Compress/ }).first().click();
  await expect(page.getByRole('article', { name }).getByText(/[−+]\d+(\.\d+)?%/)).toBeVisible({ timeout: 45_000 });
}

test('shell reloads offline after the first visit', async ({ page, context }) => {
  await page.goto('/');
  await swReady(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Tools' }).getByRole('link')).toHaveCount(17);
});

test('a tool used once works offline after a reload, including its worker', async ({ page, context }) => {
  await page.goto('/');
  await swReady(page);
  await page.goto('/tools/compress');
  await compress(page, 'first.jpg');
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Compress files' })).toBeVisible();
  await compress(page, 'offline.jpg');
});

test('a tool never opened fails honestly offline; "Save all tools" makes it available', async ({ page, context }) => {
  await page.goto('/');
  await swReady(page);
  await context.setOffline(true);
  await page.goto('/tools/pdf');
  await expect(page.getByRole('button', { name: /Reload tool/i })).toBeVisible({ timeout: 15_000 });
  await context.setOffline(false);

  await page.goto('/settings');
  await page.getByRole('button', { name: /Save all tools for offline use/ }).click();
  await expect(page.getByRole('button', { name: 'All tools saved for offline use' })).toBeVisible({ timeout: 60_000 });
  await context.setOffline(true);
  await page.goto('/tools/pdf');
  await expect(page.getByRole('heading', { level: 1, name: 'PDF pages' })).toBeVisible();
  await page.goto('/tools/dev-tools?u=hash');
  await expect(page.getByRole('heading', { level: 2, name: 'Hash' })).toBeVisible();
});

test('production CSP is present and nothing violates it on the home and compress routes', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
  });
  await page.goto('/');
  expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').count()).toBe(1);
  await page.goto('/tools/compress');
  await compress(page, 'csp.jpg');
  expect(violations).toEqual([]);
});
