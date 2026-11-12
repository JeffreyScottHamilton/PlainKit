import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { makeJpeg, makeTransparentPng } from './fixtures';

// Benchmarks on named fixtures. Opt-in: PK_BENCH=1 npx playwright test e2e/bench.spec.ts --workers=1
// Times are wall-clock from the click to the visible result, so they include UI overhead.
test.skip(!process.env.PK_BENCH, 'set PK_BENCH=1 to run benchmarks');

const rows: { fixture: string; bytes: number; action: string; coldMs: number; warmMs: number; resultBytes?: number; note?: string }[] = [];
const main = (p: Page) => p.getByRole('main');
const timed = async (fn: () => Promise<void>) => {
  const t = Date.now();
  await fn();
  return Date.now() - t;
};

test.afterAll(() => {
  mkdirSync('.audit', { recursive: true });
  writeFileSync('.audit/bench.json', JSON.stringify(rows, null, 2));
  for (const r of rows) console.log(`BENCH|${r.fixture}|${r.bytes}|${r.action}|cold ${r.coldMs}|warm ${r.warmMs}|${r.resultBytes ?? ''}|${r.note ?? ''}`);
});

async function compressOnce(page: Page, name: string, buffer: Buffer) {
  await page.locator('input[type=file]').first().setInputFiles({ name, mimeType: 'image/jpeg', buffer });
  const ms = await timed(async () => {
    await page.getByRole('button', { name: /^Compress/ }).first().click();
    await expect(page.getByRole('article', { name }).getByText(/[−+]\d+(\.\d+)?%/)).toBeVisible({ timeout: 120_000 });
  });
  return ms;
}

test('medium phone JPEG (4000x3000) -> JPEG quality 80 (defaults)', async ({ page }) => {
  await page.goto('/tools/compress');
  const jpeg = await makeJpeg(page, 4000, 3000, 0.9);
  const cold = await compressOnce(page, 'phone-a.jpg', jpeg);
  await page.reload(); // one file per run; engine chunks and worker are now cached
  const warm = await compressOnce(page, 'phone-b.jpg', jpeg);
  rows.push({ fixture: 'generated JPEG 4000x3000 q90 (noise + gradient)', bytes: jpeg.length, action: 'Compress, quality mode', coldMs: cold, warmMs: warm });
});

test('transparent PNG (1500x1500) -> WebP', async ({ page }) => {
  await page.goto('/tools/convert');
  const png = makeTransparentPng(1500, 1500);
  const run = async (name: string) => {
    await page.locator('input[type=file]').first().setInputFiles({ name, mimeType: 'image/png', buffer: png });
    await page.getByRole('combobox', { name: 'Output format' }).selectOption('image/webp');
    return timed(async () => {
      await page.getByRole('button', { name: 'Convert', exact: true }).click();
      await expect(page.getByRole('article', { name }).getByRole('button', { name: /^Download/ }).first()).toBeVisible({ timeout: 120_000 });
    });
  };
  const cold = await run('alpha-a.png');
  await page.reload();
  const warm = await run('alpha-b.png');
  rows.push({ fixture: 'generated transparent PNG 1500x1500', bytes: png.length, action: 'Convert to WebP', coldMs: cold, warmMs: warm });
});

test('20-page mixed PDF -> export', async ({ page }) => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 20; i++) {
    const pg = doc.addPage(i % 3 === 0 ? [842, 595] : i % 3 === 1 ? [595, 842] : [612, 792]);
    for (let l = 0; l < 40; l++) pg.drawText(`Page ${i + 1} line ${l + 1} of a mixed-size benchmark document.`, { x: 40, y: pg.getHeight() - 40 - l * 14, size: 10 });
  }
  const bytes = Buffer.from(await doc.save());
  await page.goto('/tools/pdf');
  await expect(page.getByRole('heading', { level: 1, name: 'PDF pages' })).toBeVisible();
  const load = await timed(async () => {
    await main(page).locator('input[type=file]').setInputFiles({ name: 'mixed-20.pdf', mimeType: 'application/pdf', buffer: bytes });
    await expect(main(page).getByRole('list', { name: 'Pages' }).getByRole('listitem')).toHaveCount(20, { timeout: 60_000 });
  });
  const exportOnce = () =>
    timed(async () => {
      await page.getByRole('complementary', { name: 'PDF settings' }).getByRole('button', { name: 'Export PDF' }).click();
      await expect(main(page).getByRole('region', { name: 'Results' }).getByText('Verified: 20 pages')).toBeVisible({ timeout: 60_000 });
    });
  const cold = await exportOnce();
  await page.reload();
  await main(page).locator('input[type=file]').setInputFiles({ name: 'mixed-20b.pdf', mimeType: 'application/pdf', buffer: bytes });
  await expect(main(page).getByRole('list', { name: 'Pages' }).getByRole('listitem')).toHaveCount(20, { timeout: 60_000 });
  const warm = await exportOnce();
  rows.push({ fixture: 'generated 20-page PDF, three page sizes, text only', bytes: bytes.length, action: 'Export PDF (copy + verify)', coldMs: cold, warmMs: warm, note: `import+inspect ${load} ms` });
});

test('CSV, 5,000 rows with quoted fields -> parse and preview', async ({ page }) => {
  let csv = 'id,name,note,city\n';
  for (let i = 0; i < 5000; i++) csv += `${i},"Person, ${i}","line one\nline two ""quoted""",東京\n`;
  const buf = Buffer.from(csv, 'utf8');
  await page.goto('/tools/csv');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const run = (name: string) =>
    timed(async () => {
      await main(page).locator('input[type="file"]').setInputFiles({ name, mimeType: 'text/csv', buffer: buf });
      await expect(main(page).getByText('5,000 rows', { exact: true }).or(main(page).getByText('5000 rows', { exact: true })).first()).toBeVisible({ timeout: 60_000 });
    });
  const cold = await run('people-a.csv');
  const warm = await run('people-b.csv');
  rows.push({ fixture: 'generated CSV, 5,000 rows, quoted commas/newlines/quotes, CJK', bytes: buf.length, action: 'Import, parse, preview', coldMs: cold, warmMs: warm });
});
