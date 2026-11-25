import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';

/** Two pages; page 1 carries visible text so the export has real content to keep. */
async function twoPagePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const p1 = doc.addPage([400, 500]);
  p1.drawText('Contract for review', { x: 40, y: 440, size: 18, font });
  doc.addPage([400, 500]);
  return Buffer.from(await doc.save());
}

/** The tool's own content; the tray also lists downloads, so every query starts here. */
const tool = (page: Page) => page.locator('.pk-tool__main');

async function drawSignature(page: Page) {
  const pad = page.getByRole('img', { name: /Signature pad/ });
  await pad.scrollIntoViewIfNeeded();
  const box = await pad.boundingBox();
  if (!box) throw new Error('signature pad has no box');
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 30, y);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(box.x + 30 + i * 6, y + Math.sin(i / 3) * 20, { steps: 2 });
  }
  await page.mouse.up();
}

test.describe('Sign PDF tool', () => {
  test('draw a signature, place it with text, export; signed copy gains content, original is untouched', async ({ page }) => {
    await page.goto('/tools/sign-pdf');
    await expect(page.getByRole('heading', { level: 1, name: 'Sign and fill PDF' })).toBeVisible();
    const main = tool(page);

    const src = await twoPagePdf();
    await main.locator('input[type=file]').setInputFiles([{ name: 'contract.pdf', mimeType: 'application/pdf', buffer: src }]);
    await expect(main.getByText('Page 1 of 2')).toBeVisible({ timeout: 30_000 });

    await drawSignature(page);
    await page.getByRole('button', { name: 'Save as signature' }).click();
    await expect(page.getByRole('img', { name: 'Saved signature' })).toBeVisible();

    await page.getByRole('button', { name: 'Place signature' }).click();
    await page.getByLabel('Text', { exact: true }).fill('Approved');
    await page.getByRole('button', { name: 'Add text' }).click();

    await page.getByRole('complementary', { name: 'Sign PDF settings' }).getByRole('button', { name: 'Sign and export PDF' }).click();

    const results = main.getByRole('region', { name: 'Results' });
    await expect(results.getByText('Verified: 2 pages')).toBeVisible({ timeout: 45_000 });
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      results.getByRole('button', { name: /^Download .*signed\.pdf/ }).click(),
    ]);
    expect(dl.suggestedFilename()).toBe('contract-signed.pdf');

    const out = await PDFDocument.load(readFileSync((await dl.path())!), { updateMetadata: false });
    const pages = out.getPages();
    expect(pages.length).toBe(2);
    const xobjects = (i: number) => pages[i]?.node.Resources()?.lookup(PDFName.of('XObject'));
    expect(xobjects(0), 'signed page 1 should reference the signature image').toBeDefined();
    expect(xobjects(1), 'unsigned page 2 should have no image').toBeUndefined();

    // The original upload in the session is still byte-identical.
    const [orig] = await Promise.all([
      page.waitForEvent('download'),
      main.getByRole('button', { name: 'Download contract.pdf', exact: true }).click(),
    ]);
    expect(readFileSync((await orig.path())!).equals(src)).toBe(true);
  });
});
