import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import Papa from 'papaparse';

// Scope to the tool's own area so the session tray's "Download <name>" buttons never match.
const main = (page: Page) => page.locator('.pk-tool__main');

async function openCsv(page: Page) {
  await page.goto('/tools/csv');
  await expect(page.getByRole('heading', { level: 1, name: 'CSV cleanup' })).toBeVisible();
}

test('CSV: sort by a numeric column orders numbers numerically, empty cells last, and the export keeps that order', async ({ page }) => {
  await openCsv(page);
  const csv = ['name,score', 'A,10', 'B,9', 'C,100', 'D,', ''].join('\n');
  await main(page).locator('input[type="file"]').setInputFiles({ name: 'scores.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
  await expect(main(page).getByText('4 rows', { exact: true })).toBeVisible();

  await main(page).getByLabel('Operation').selectOption('sort');
  await main(page).getByLabel('Column').selectOption('1');
  await expect(main(page).getByText(/Would sort 4 rows by "score", ascending/)).toBeVisible();
  await main(page).getByRole('button', { name: 'Apply' }).click();

  await main(page).getByRole('button', { name: 'Export CSV' }).click();
  await expect(main(page).getByText(/Verified: 4 rows read back and matched\./)).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    main(page).getByRole('button', { name: /^Download scores-.*\.csv$/ }).click(),
  ]);
  const data = Papa.parse<string[]>(readFileSync(await download.path(), 'utf8'), { skipEmptyLines: true }).data;
  expect(data.map((r) => r[0])).toEqual(['name', 'B', 'A', 'C', 'D']);
});

test('CSV: a JSON array of objects imports as a table and is labelled as JSON', async ({ page }) => {
  await openCsv(page);
  const json = JSON.stringify([
    { city: 'Oslo', pop: 709037 },
    { city: 'Lima', pop: 9752000 },
  ]);
  await main(page).locator('input[type="file"]').setInputFiles({ name: 'cities.json', mimeType: 'application/json', buffer: Buffer.from(json, 'utf8') });
  await expect(main(page).getByText('Format: JSON, array of objects')).toBeVisible();
  await expect(main(page).getByText('2 rows', { exact: true })).toBeVisible();
  await expect(main(page).getByRole('region', { name: 'Preview table' })).toContainText('Lima');
});
