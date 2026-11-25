import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

test('packs two files into a ZIP that opens in fflate with both entries and contents', async ({ page }) => {
  await page.goto('/tools/zip');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1, name: 'Zip and unzip' })).toBeVisible();

  await main.locator('input[type=file]').first().setInputFiles([
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello zip') },
    { name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1,2\n') },
  ]);
  await expect(main.getByText('notes.txt', { exact: true })).toBeVisible();

  await main.getByRole('button', { name: 'Make ZIP', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await main.getByRole('button', { name: 'Download archive.zip' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('archive.zip');

  const entries = unzipSync(new Uint8Array(readFileSync((await download.path())!)));
  expect(Object.keys(entries).sort()).toEqual(['data.csv', 'notes.txt']);
  expect(strFromU8(entries['notes.txt']!)).toBe('hello zip');
  expect(strFromU8(entries['data.csv']!)).toBe('a,b\n1,2\n');
});

test('opens a ZIP with a nested folder, extracts one entry and downloads it with the right content', async ({ page }) => {
  const zip = Buffer.from(
    zipSync({
      'docs/readme.txt': strToU8('read me'),
      'docs/sub/data.csv': strToU8('a,b\n1,2\n'),
      'pic.txt': strToU8('picture placeholder'),
    }),
  );
  await page.goto('/tools/zip');
  const main = page.getByRole('main');
  await main.getByRole('radio', { name: 'Open a ZIP' }).click();
  await main.locator('input[type=file]').setInputFiles({ name: 'sample.zip', mimeType: 'application/zip', buffer: zip });

  await expect(main.getByText('docs/sub/data.csv', { exact: true })).toBeVisible();
  await expect(main.getByText('3 entries', { exact: false })).toBeVisible();
  await main.getByRole('checkbox', { name: 'Select docs/sub/data.csv' }).check();
  await main.getByRole('button', { name: 'Extract selected (1)' }).click();

  const downloadEvent = page.waitForEvent('download');
  await main.getByRole('button', { name: 'Download data.csv' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('data.csv');
  expect(readFileSync((await download.path())!, 'utf8')).toBe('a,b\n1,2\n');
});
