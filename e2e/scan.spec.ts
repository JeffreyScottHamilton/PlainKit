import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

// Corners of the white sheet in the 800 × 700 test photo, in TL, TR, BR, BL order.
const SHEET = [
  { x: 200, y: 120 },
  { x: 600, y: 150 },
  { x: 580, y: 650 },
  { x: 170, y: 600 },
];

/** Paper on a darker table, skewed so the page is not axis-aligned, with black text-like bars. Drawn on a canvas in the page. */
async function makePhotoPng(page: Page): Promise<Buffer> {
  await page.goto('/tools/scan');
  const dataUrl = await page.evaluate((sheet) => {
    const c = document.createElement('canvas');
    c.width = 800;
    c.height = 700;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(0, 0, 800, 700);
    ctx.fillStyle = '#f2f2ee';
    ctx.beginPath();
    sheet.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#101010';
    for (let y = 260; y < 560; y += 40) ctx.fillRect(260, y, 280, 14);
    return c.toDataURL('image/png');
  }, SHEET);
  return Buffer.from(dataUrl.split(',')[1]!, 'base64');
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Aspect of the sheet as the tool computes it: average of opposite edge lengths. */
function expectedAspect(q: typeof SHEET): number {
  const w = (dist(q[0]!, q[1]!) + dist(q[3]!, q[2]!)) / 2;
  const h = (dist(q[0]!, q[3]!) + dist(q[1]!, q[2]!)) / 2;
  return w / h;
}

test('a skewed photo of a page exports one straight PDF page with the sheet aspect', async ({ page }) => {
  const png = await makePhotoPng(page);
  const origin = new URL(page.url()).origin;
  const external: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.origin !== origin && u.protocol !== 'data:' && u.protocol !== 'blob:') external.push(r.url());
  });
  await page.goto('/tools/scan');
  await page.getByRole('main').locator('input[type=file]').first().setInputFiles({ name: 'sheet.png', mimeType: 'image/png', buffer: png });

  // Corner detection must finish before export, or the export would use the full-image fallback.
  await expect(page.getByText('Page edges found')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('radio', { name: 'Black & white' }).click();
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();

  const btn = page.getByRole('button', { name: /Download sheet-scan\.pdf/ }).first();
  await expect(btn).toBeVisible({ timeout: 60_000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), btn.click()]);
  const doc = await PDFDocument.load(readFileSync((await dl.path())!));
  expect(doc.getPageCount()).toBe(1);
  const { width, height } = doc.getPage(0).getSize();
  const aspect = width / height;
  const want = expectedAspect(SHEET);
  expect(Math.abs(aspect - want) / want).toBeLessThan(0.05);
  expect(external).toEqual([]);
});

test('corner handles are labelled and at least 44px square', async ({ page }) => {
  const png = await makePhotoPng(page);
  await page.goto('/tools/scan');
  await page.getByRole('main').locator('input[type=file]').first().setInputFiles({ name: 'sheet.png', mimeType: 'image/png', buffer: png });
  for (const name of ['Top-left corner', 'Top-right corner', 'Bottom-right corner', 'Bottom-left corner']) {
    const handle = page.getByRole('button', { name, exact: true });
    await expect(handle).toBeVisible({ timeout: 30_000 });
    const box = await handle.boundingBox();
    expect(box && box.width >= 44 && box.height >= 44).toBe(true);
  }
  await page.getByRole('button', { name: 'Reset to full image' }).click();
  await expect(page.getByRole('button', { name: 'Top-left corner', exact: true })).toBeVisible();
});
