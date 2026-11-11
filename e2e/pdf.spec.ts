import { expect, test, type Download, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';

/** Pages are only the width given, so order is checkable after export. */
async function pdfWith(widths: number[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (const w of widths) doc.addPage([w, 300]);
  return Buffer.from(await doc.save());
}

async function reload(d: Download) {
  const doc = await PDFDocument.load(readFileSync((await d.path())!), { updateMetadata: false });
  return doc.getPages().map((p) => ({ width: p.getSize().width, rotation: p.getRotation().angle }));
}

/** The tool's own content; the tray also lists downloads, so every query starts here. */
const tool = (page: Page) => page.locator('.pk-tool__main');

test.describe('PDF tool: merge, reorder, rotate, export', () => {
  test('two PDFs merge in order; keyboard reorder and rotate survive export; corrupt file is reported alone', async ({ page }) => {
    await page.goto('/tools/pdf');
    await expect(page.getByRole('heading', { level: 1, name: 'PDF pages' })).toBeVisible();
    const main = tool(page);

    const a = await pdfWith([200, 201, 202]);
    const b = await pdfWith([300, 301]);
    await main.locator('input[type=file]').setInputFiles([
      { name: 'a.pdf', mimeType: 'application/pdf', buffer: a },
      { name: 'b.pdf', mimeType: 'application/pdf', buffer: b },
      { name: 'x.pdf', mimeType: 'application/pdf', buffer: randomBytes(2048) },
    ]);

    const list = main.getByRole('list', { name: 'Pages' });
    await expect(list.getByRole('listitem')).toHaveCount(5);
    await expect(main.getByText('This file could not be read as a PDF.')).toBeVisible();
    // Thumbnails render lazily when near the viewport, so scroll the first tile in before checking it.
    await list.getByRole('listitem').first().scrollIntoViewIfNeeded();
    await expect(list.locator('.pdf-thumb[data-state="ready"]').first()).toBeVisible({ timeout: 30_000 });

    // Move page 5 (b.pdf page 2, width 301) to the front with the keyboard: focus the button, press Enter.
    for (let pos = 5; pos > 1; pos--) {
      const btn = main.getByRole('button', { name: `Move earlier, page ${pos}` });
      await btn.focus();
      await page.keyboard.press('Enter');
    }
    await expect(main.getByRole('status')).toHaveText('Page moved to position 1');
    await expect(list.getByRole('listitem').first()).toContainText('b.pdf · p.2');

    // Rotate the page now at position 2 (a.pdf page 1, width 200) to the right.
    await main.getByRole('checkbox', { name: 'Select page 2' }).check();
    await main.getByRole('toolbar', { name: 'Page actions' }).getByRole('button', { name: 'Rotate right' }).click();

    await page.getByRole('complementary', { name: 'PDF settings' }).getByRole('button', { name: 'Export PDF' }).click();

    const results = main.getByRole('region', { name: 'Results' });
    await expect(results.getByText('Verified: 5 pages')).toBeVisible({ timeout: 45_000 });
    const [dl] = await Promise.all([page.waitForEvent('download'), results.getByRole('button', { name: 'Download b-merged.pdf' }).click()]);
    expect(dl.suggestedFilename()).toBe('b-merged.pdf');

    const pages = await reload(dl);
    expect(pages.map((p) => p.width)).toEqual([301, 200, 201, 202, 300]);
    expect(pages.map((p) => p.rotation)).toEqual([0, 90, 0, 0, 0]);

    // Original upload is still in the session, byte-identical.
    const [orig] = await Promise.all([page.waitForEvent('download'), main.getByRole('region', { name: 'Files' }).getByRole('button', { name: 'Download a.pdf' }).click()]);
    expect(readFileSync((await orig.path())!).equals(a)).toBe(true);
  });

  test('Ctrl+Z undoes a move when focus is not in a text field', async ({ page }) => {
    await page.goto('/tools/pdf');
    await expect(page.getByRole('heading', { level: 1, name: 'PDF pages' })).toBeVisible();
    const main = tool(page);
    await main.locator('input[type=file]').setInputFiles({ name: 'a.pdf', mimeType: 'application/pdf', buffer: await pdfWith([200, 201, 202]) });

    const list = main.getByRole('list', { name: 'Pages' });
    await expect(list.getByRole('listitem')).toHaveCount(3);
    await main.getByRole('button', { name: 'Move earlier, page 3' }).click();
    await expect(list.getByRole('listitem').nth(1)).toContainText('a.pdf · p.3');
    await page.keyboard.press('Control+z');
    await expect(list.getByRole('listitem').nth(2)).toContainText('a.pdf · p.3');
  });
});
