import { readFileSync } from 'node:fs';
import { expect, test, type Download, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

async function pdfWith(widths: number[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (const w of widths) doc.addPage([w, 300]);
  return Buffer.from(await doc.save());
}

async function reload(d: Download) {
  const doc = await PDFDocument.load(readFileSync((await d.path())!), { updateMetadata: false });
  return doc.getPages().map((p) => ({ width: p.getSize().width }));
}

const tool = (page: Page) => page.locator('.pk-tool__main');

test('PDF split by ranges with page numbers: each range is its own output with the right pages', async ({ page }) => {
  await page.goto('/tools/pdf');
  await expect(page.getByRole('heading', { level: 1, name: 'PDF pages' })).toBeVisible();
  const main = tool(page);
  await main.locator('input[type=file]').setInputFiles({ name: 'a.pdf', mimeType: 'application/pdf', buffer: await pdfWith([200, 201, 202]) });
  await expect(main.getByRole('list', { name: 'Pages' }).getByRole('listitem')).toHaveCount(3);

  // Settings live in the side panel, outside the tool's main area.
  await page.getByRole('radio', { name: 'Page 1 of N' }).click();
  await page.getByLabel('Split ranges').fill('1-2, 3');
  await page.getByRole('button', { name: 'Split by ranges' }).click();

  await expect(main.getByTitle('a-part-1.pdf')).toBeVisible({ timeout: 60_000 });
  await expect(main.getByTitle('a-part-2.pdf')).toBeVisible();
  await expect(main.getByText('Verified: 2 pages')).toBeVisible();
  await expect(main.getByText('Verified: 1 page')).toBeVisible();

  const [dl] = await Promise.all([page.waitForEvent('download'), main.getByRole('button', { name: 'Download a-part-2.pdf' }).click()]);
  expect(await reload(dl)).toEqual([{ width: 202 }]);
});

test('PDF split ranges reject an out-of-range page before any job starts', async ({ page }) => {
  await page.goto('/tools/pdf');
  const main = tool(page);
  await main.locator('input[type=file]').setInputFiles({ name: 'b.pdf', mimeType: 'application/pdf', buffer: await pdfWith([300, 301]) });
  await expect(main.getByRole('list', { name: 'Pages' }).getByRole('listitem')).toHaveCount(2);
  await page.getByLabel('Split ranges').fill('1, 5');
  await expect(page.getByText('Pages go from 1 to 2.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Split by ranges' })).toBeDisabled();
});
