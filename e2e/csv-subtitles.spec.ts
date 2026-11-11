import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import Papa from 'papaparse';

// Scope interactions to the tool's own area so the session tray's "Download <name>" buttons never match.
const main = (page: Page) => page.locator('.pk-tool__main');
const settings = (page: Page) => page.getByRole('complementary', { name: 'Subtitles settings' });

async function openTool(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
}

const CSV = [
  'id,name,note',
  '1,Ann,"hello, world"',
  '2,Bo,"line one',
  'line two"',
  '3,東京 مرحبا 🎉,plain',
  '4,Dee,dup',
  '4,Dee,dup',
  '',
].join('\n');

const SRT = ['1', '00:00:01,000 --> 00:00:02,000', 'First', '', '2', '00:00:03,000 --> 00:00:04,500', 'Second', '', '3', '00:00:05,000 --> 00:00:06,000', 'Third', ''].join('\n');

test('CSV: quoted fields and non-Latin rows survive; duplicate removal previews, applies, undoes; export re-reads correctly', async ({ page }) => {
  await openTool(page, '/tools/csv', 'CSV cleanup');
  await main(page).locator('input[type="file"]').setInputFiles({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV, 'utf8') });

  await expect(main(page).getByText('5 rows', { exact: true })).toBeVisible();
  await expect(main(page).locator('td', { hasText: 'line one' })).toBeVisible();
  await expect(main(page).getByText('東京 مرحبا 🎉', { exact: true })).toBeVisible();

  await main(page).getByLabel('Operation').selectOption({ label: 'Remove duplicate rows' });
  await expect(main(page).getByText('Would remove 1 duplicate row by exact match, keeping the first.')).toBeVisible();
  await main(page).getByRole('button', { name: 'Apply' }).click();
  await expect(main(page).getByText('4 rows', { exact: true })).toBeVisible();

  await main(page).getByRole('button', { name: 'Undo' }).click();
  await expect(main(page).getByText('5 rows', { exact: true })).toBeVisible();

  await main(page).getByRole('button', { name: 'Export CSV' }).click();
  await expect(main(page).getByText('Verified: 5 rows read back and matched.')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    main(page).getByRole('button', { name: 'Download people-cleaned.csv' }).click(),
  ]);
  const text = readFileSync(await download.path(), 'utf8');
  const data = Papa.parse<string[]>(text, { skipEmptyLines: false }).data;
  if (data[data.length - 1]?.length === 1 && data[data.length - 1]?.[0] === '') data.pop();
  expect(data.length).toBe(6); // header + 5 rows
  const bo = data.find((r) => r[1] === 'Bo');
  expect(bo?.[2]).toBe('line one\nline two');
  expect(data.find((r) => r[1] === 'Ann')?.[2]).toBe('hello, world');
});

test('Subtitles: offset +1500 ms, export as VTT, the downloaded file starts with WEBVTT and the first cue moved exactly', async ({ page }) => {
  await openTool(page, '/tools/subtitles', 'Subtitles');
  await main(page).locator('input[type="file"]').setInputFiles({ name: 'sub.srt', mimeType: 'application/x-subrip', buffer: Buffer.from(SRT, 'utf8') });
  await expect(main(page).getByLabel('Start of cue 1')).toHaveValue('00:00:01.000');

  await settings(page).getByLabel('Offset (ms)').fill('1500');
  await settings(page).getByRole('button', { name: 'Apply offset' }).click();
  await expect(main(page).getByLabel('Start of cue 1')).toHaveValue('00:00:02.500');

  await settings(page).getByRole('radio', { name: 'WebVTT' }).click();
  await settings(page).getByRole('button', { name: 'Export subtitles' }).click();
  await expect(settings(page).getByText('Verified: 3 cues read back with the same times.')).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    settings(page).getByRole('button', { name: 'Download sub-edited.vtt' }).click(),
  ]);
  const out = readFileSync(await download.path(), 'utf8');
  expect(out.startsWith('WEBVTT')).toBe(true);
  expect(out).toContain('00:00:02.500 --> 00:00:03.500\nFirst');
});
