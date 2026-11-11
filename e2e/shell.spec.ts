import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

const NAMES = ['Compress', 'Convert', 'Cutout', 'Dev tools', 'Metadata', 'Clean links', 'Send files', 'Redact', 'PDF',
  'Audio stems', 'Subtitles', 'QR code', 'CSV', 'ID photo', 'Clean text', 'Video', 'Keep awake'];

const tinyPng = () => PNG.sync.write(new PNG({ width: 4, height: 4 }));

function sidebarLinks(page: Page) {
  return page.getByRole('navigation', { name: 'Tools' }).getByRole('link');
}

test('sidebar lists all 17 tools in registry order', async ({ page }) => {
  await page.goto('/');
  await expect(sidebarLinks(page)).toHaveCount(17);
  await expect(sidebarLinks(page)).toHaveText(NAMES);
});

test('clicking a tool updates URL and breadcrumb; back returns home', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Tools' }).getByRole('link', { name: 'Compress', exact: true }).click();
  await expect(page).toHaveURL(/\/tools\/compress$/);
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Compress files');
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Workspace' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'What are we working on?' })).toBeVisible();
});

test('search "shrinkray" leaves only Compress', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Find a tool' }).fill('shrinkray');
  await expect(sidebarLinks(page)).toHaveCount(1);
  await expect(sidebarLinks(page)).toHaveText(['Compress']);
});

test('Ctrl+K opens command search; Enter on "pdf" navigates to /tools/pdf', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Search tools' });
  await expect(dialog).toBeVisible();
  await page.getByRole('combobox', { name: 'Search tools' }).fill('pdf');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/tools\/pdf$/);
  await expect(dialog).toBeHidden();
});

test('theme switch sets data-theme and survives reload', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Theme').selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByLabel('Theme')).toHaveValue('light');
});

test('mobile drawer: 17 links, Escape closes, focus returns to the button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  const opener = page.getByRole('button', { name: 'Open tools menu' });
  await opener.click();
  const drawer = page.getByRole('dialog', { name: 'Tools menu' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('navigation', { name: 'Tools' }).getByRole('link')).toHaveCount(17);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(opener).toBeFocused();
});

test('adding a PNG shows it in the tray; Use in... lists Compress but not PDF', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: tinyPng() });
  const tray = page.getByRole('region', { name: 'This session' });
  await expect(tray.getByTitle('tiny.png', { exact: true })).toBeVisible();
  await tray.getByRole('button', { name: /Use in/ }).click();
  await expect(page.getByRole('menuitem', { name: 'Compress' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'PDF', exact: true })).toHaveCount(0);
});

test('Clear session empties the tray', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: tinyPng() });
  const tray = page.getByRole('region', { name: 'This session' });
  await expect(tray.getByTitle('tiny.png', { exact: true })).toBeVisible();
  await tray.getByRole('button', { name: 'Clear session' }).click();
  await expect(page.getByText('No files yet.')).toBeVisible();
  await expect(tray.getByTitle('tiny.png', { exact: true })).toHaveCount(0);
});

test('no horizontal page scroll at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const path of ['/', '/tools/compress', '/settings']) {
    await page.goto(path);
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(fits, path).toBe(true);
  }
});
