import { expect, test, type Download, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';

const DOCX = readFileSync(new URL('./fixtures/docs/sample.docx', import.meta.url));
const PHRASE = 'PlainKit converts Word files locally.';

/** The tool's own content; the tray also lists downloads, so every query starts here. */
const tool = (page: Page) => page.locator('.pk-tool__main');

async function downloaded(d: Download): Promise<Buffer> {
  const path = await d.path();
  if (!path) throw new Error('download has no path');
  return readFileSync(path);
}

/** Text of every page, read with pdf.js (the browser-side reader is not used to check its own output). */
async function pdfText(bytes: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    pages.push(content.items.map((i) => ('str' in i ? i.str + (i.hasEOL ? '\n' : '') : '')).join(''));
  }
  return pages.join('\n');
}

test.describe('Convert: documents', () => {
  test('DOCX to PDF: the file opens with pages and the known phrase reads back', async ({ page }) => {
    await page.goto('/tools/convert');
    const main = tool(page);
    await main.locator('input[type=file]').first().setInputFiles({ name: 'plan.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: DOCX });

    // The Documents tab follows the newly added file, and the output defaults to PDF.
    await expect(page.getByRole('radio', { name: 'Documents' })).toBeChecked();
    await expect(main.getByLabel('Output for plan.docx')).toHaveValue('pdf');
    await main.getByRole('button', { name: 'Convert', exact: true }).click();

    const [dl] = await Promise.all([page.waitForEvent('download'), main.getByRole('button', { name: /^Download plan-converted\.pdf/ }).click()]);
    const bytes = await downloaded(dl);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(await pdfText(bytes)).toContain(PHRASE);
  });

  test('Markdown to PDF, and the PDF to plain text back out', async ({ page }) => {
    await page.goto('/tools/convert');
    const main = tool(page);
    const md = '# Notes\n\nA **bold** line and a [link](https://example.org).\n\n- one\n- two\n';
    await main.locator('input[type=file]').first().setInputFiles({ name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from(md) });
    await expect(main.getByLabel('Output for notes.md')).toHaveValue('pdf');
    await main.getByRole('button', { name: 'Convert', exact: true }).click();
    const [mdDl] = await Promise.all([page.waitForEvent('download'), main.getByRole('button', { name: /^Download notes-converted\.pdf/ }).click()]);
    const pdfBytes = await downloaded(mdDl);
    expect(await pdfText(pdfBytes)).toContain('A bold line and a link.');

    // Feed the produced PDF back in and extract its text.
    await main.locator('input[type=file]').first().setInputFiles({ name: 'notes-converted.pdf', mimeType: 'application/pdf', buffer: pdfBytes });
    await expect(main.getByLabel('Output for notes-converted.pdf')).toHaveValue('txt');
    await main.getByRole('button', { name: 'Extract text' }).click();
    const [txtDl] = await Promise.all([page.waitForEvent('download'), main.getByRole('button', { name: /^Download notes-converted-converted\.txt/ }).click()]);
    const text = (await downloaded(txtDl)).toString('utf8');
    expect(text).toContain('Notes');
    expect(text).toContain('one');
  });

  test('Markdown to HTML shows a sanitised preview: the script is removed, the emphasis stays', async ({ page }) => {
    await page.goto('/tools/convert');
    const main = tool(page);
    const md = 'Preview **strong** text.\n\n<script>window.__pwned = true</script>\n';
    await main.locator('input[type=file]').first().setInputFiles({ name: 'page.md', mimeType: 'text/markdown', buffer: Buffer.from(md) });
    await main.getByLabel('Output for page.md').selectOption('html');
    await main.getByRole('button', { name: 'Convert', exact: true }).click();
    const preview = main.getByRole('region', { name: 'Preview of page-converted.html' });
    await expect(preview.locator('strong')).toHaveText('strong');
    await expect(preview.locator('script')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned ?? false)).toBe(false);
  });

  test('a legacy .doc file gets an explicit unsupported message, not a convert button', async ({ page }) => {
    await page.goto('/tools/convert');
    const main = tool(page);
    await main.locator('input[type=file]').first().setInputFiles({ name: 'old.doc', mimeType: 'application/msword', buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3]) });
    await expect(main.getByText(/old\.doc: Old \.doc files are not supported: save as \.docx first\./)).toBeVisible();
    await expect(main.getByLabel('Output for old.doc')).toHaveCount(0);
  });
});
