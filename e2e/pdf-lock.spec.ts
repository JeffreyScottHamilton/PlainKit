import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const TEXT = 'Contract for review';
const PASSWORD = 'open-pw-7';

async function plainPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([400, 300]);
  page.drawText(TEXT, { x: 40, y: 220, size: 18, font });
  return Buffer.from(await doc.save());
}

/** Independent reader (pdf.js legacy build). Rejects with PasswordException when a password is needed. */
async function pdfjsText(data: Buffer, password?: string): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const standardFontDataUrl = join(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts/');
  const task = pdfjs.getDocument({ data: new Uint8Array(data), password, useSystemFonts: false, standardFontDataUrl });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const tc = await page.getTextContent();
    return tc.items.map((i) => ('str' in i ? i.str : '')).join('');
  } finally {
    await task.destroy();
  }
}

/** The tool's own content; the tray also lists downloads, so every query starts here. */
const tool = (page: Page) => page.locator('.pk-tool__main');

test.describe('PDF password tool', () => {
  test('lock with a password, download, then unlock and download a PDF that opens with no password', async ({ page }) => {
    const offOrigin: string[] = [];
    let origin = '';
    page.on('request', (req) => {
      const u = new URL(req.url());
      if (u.protocol === 'data:' || u.protocol === 'blob:') return;
      if (origin && u.origin !== origin) offOrigin.push(req.url());
    });

    await page.goto('/tools/pdf-lock');
    origin = new URL(page.url()).origin;
    await expect(page.getByRole('heading', { level: 1, name: 'Lock or unlock a PDF' })).toBeVisible();
    const main = tool(page);

    await main.locator('input[type=file]').setInputFiles([{ name: 'letter.pdf', mimeType: 'application/pdf', buffer: await plainPdf() }]);
    await expect(main.getByText('This PDF has no password.')).toBeVisible({ timeout: 30_000 });

    await page.getByLabel('Password to open the PDF').fill(PASSWORD);
    await page.getByLabel('Confirm password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Lock PDF' }).click();

    const download = main.getByRole('button', { name: /^Download/ }).first();
    await expect(download).toBeVisible({ timeout: 60_000 });
    const [lockedDl] = await Promise.all([page.waitForEvent('download'), download.click()]);
    expect(lockedDl.suggestedFilename()).toBe('letter-locked.pdf');
    const locked = readFileSync(await lockedDl.path());
    expect(locked.includes(Buffer.from(TEXT))).toBe(false);
    await expect(pdfjsText(locked)).rejects.toMatchObject({ name: 'PasswordException' });
    expect(await pdfjsText(locked, PASSWORD)).toContain(TEXT);

    // Unlock the locked file from this session.
    await main.getByRole('radio', { name: /letter-locked\.pdf/ }).check();
    await page.getByRole('radio', { name: 'Remove a password' }).click();
    await page.getByLabel('Password to unlock the PDF').fill(PASSWORD);
    await page.getByRole('button', { name: 'Unlock PDF' }).click();

    const unlockedBtn = main.getByRole('button', { name: /^Download/ }).nth(1);
    await expect(unlockedBtn).toBeVisible({ timeout: 60_000 });
    const [unlockedDl] = await Promise.all([page.waitForEvent('download'), unlockedBtn.click()]);
    expect(unlockedDl.suggestedFilename()).toBe('letter-locked-unlocked.pdf');
    const unlocked = readFileSync(await unlockedDl.path());
    expect(unlocked.includes(Buffer.from('/Encrypt'))).toBe(false);
    expect(await pdfjsText(unlocked)).toContain(TEXT);

    expect(offOrigin).toEqual([]);
  });
});
