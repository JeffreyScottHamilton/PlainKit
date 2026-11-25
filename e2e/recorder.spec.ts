import { statSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Fake camera and microphone; the permission prompt is auto-accepted.
test.use({
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--auto-select-desktop-capture-source=Entire screen'],
  },
  permissions: ['microphone', 'camera'],
});

const main = (page: Page) => page.getByRole('main');
const saved = (page: Page) => page.getByRole('region', { name: 'Last recording' });

async function openRecorder(page: Page) {
  await page.goto('/tools/recorder');
  await expect(page.getByRole('heading', { level: 1, name: 'Screen and voice recorder' })).toBeVisible();
}

/** Records the chosen source for `ms`, stops, and downloads the saved file. Returns its name and byte size. */
async function recordAndDownload(page: Page, source: string, ms: number) {
  await page.getByRole('radio', { name: source }).click();
  await page.getByRole('button', { name: 'Start recording' }).click();
  await expect(main(page).getByText('Recording', { exact: true })).toBeVisible();
  await page.waitForTimeout(ms);
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(saved(page)).toBeVisible({ timeout: 15_000 });
  const downloading = page.waitForEvent('download');
  await saved(page).getByRole('button', { name: /^Download / }).click();
  const download = await downloading;
  const path = await download.path();
  if (!path) throw new Error('download has no local path');
  return { name: download.suggestedFilename(), size: statSync(path).size };
}

test('voice memo: records the microphone for about 2 s, saves it, and downloads it', async ({ page }) => {
  await openRecorder(page);
  const rec = await recordAndDownload(page, 'Voice memo', 2000);
  expect(rec.name).toMatch(/^Voice memo \d{4}-\d{2}-\d{2} \d{2}-\d{2}\.(m4a|webm)$/);
  expect(rec.size).toBeGreaterThan(0);
  await expect(saved(page).locator('audio')).toHaveAttribute('src', /^blob:/);
});

test('camera: records the camera and microphone for about 2 s, saves it, and downloads it', async ({ page }) => {
  await openRecorder(page);
  await page.getByRole('checkbox', { name: 'Include microphone' }).check();
  const rec = await recordAndDownload(page, 'Camera', 2000);
  expect(rec.name).toMatch(/^Camera recording \d{4}-\d{2}-\d{2} \d{2}-\d{2}\.(mp4|webm)$/);
  expect(rec.size).toBeGreaterThan(0);
  await expect(saved(page).locator('video')).toHaveAttribute('src', /^blob:/);
});

test('screen: records the auto-selected screen for about 2 s', async ({ page }) => {
  await openRecorder(page);
  const rec = await recordAndDownload(page, 'Screen', 2000);
  expect(rec.size).toBeGreaterThan(0);
});

test('unsupported: a browser without getDisplayMedia shows an explicit notice and cannot start screen mode', async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(MediaDevices.prototype, 'getDisplayMedia');
  });
  await openRecorder(page);
  await page.getByRole('radio', { name: 'Screen' }).click();
  await expect(main(page).getByText(/This browser cannot share the screen/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start recording' })).toBeDisabled();
  await page.getByRole('radio', { name: 'Voice memo' }).click();
  await expect(page.getByRole('button', { name: 'Start recording' })).toBeEnabled();
});

test('denied: a refused microphone gives a clear message and a next step', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
  });
  await openRecorder(page);
  await page.getByRole('radio', { name: 'Voice memo' }).click();
  await page.getByRole('button', { name: 'Start recording' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Permission for the microphone was denied.');
  await expect(alert).toContainText('Allow the microphone');
  await expect(page.getByRole('button', { name: 'Start recording' })).toBeEnabled();
});
