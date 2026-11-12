import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { PNG } from 'pngjs';
import { encodeWav16 } from '../src/engines/audio/wav';

const main = (p: Page) => p.getByRole('main');
const settings = (p: Page, name: RegExp) => p.getByRole('complementary', { name });

async function recordClip(page: Page, seconds: number): Promise<Buffer> {
  const b64 = await page.evaluate(async (secs) => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d')!;
    const rec = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 4_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    let frame = 0;
    const timer = window.setInterval(() => {
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = `hsl(${(frame * 9 + i * 37) % 360} 80% 50%)`;
        ctx.fillRect(Math.random() * 640, Math.random() * 480, 80, 60);
      }
      frame++;
    }, 33);
    const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
    rec.start(100);
    await new Promise((r) => window.setTimeout(r, secs * 1000));
    rec.stop();
    window.clearInterval(timer);
    await stopped;
    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
    return btoa(bin);
  }, seconds);
  return Buffer.from(b64, 'base64');
}

function tone(seconds: number): Buffer {
  const rate = 44100;
  const ch = new Float32Array(rate * seconds);
  for (let i = 0; i < ch.length; i++) ch[i] = 0.4 * Math.sin((2 * Math.PI * 440 * i) / rate);
  return Buffer.from(encodeWav16([ch], rate));
}
const png = (w: number, h: number) => {
  const p = new PNG({ width: w, height: h });
  for (let i = 0; i < p.data.length; i += 4) p.data.set([30, 120, 200, 255], i);
  return PNG.sync.write(p);
};
async function download(page: Page, button: ReturnType<Page['getByRole']>): Promise<Buffer> {
  const [dl] = await Promise.all([page.waitForEvent('download'), button.click()]);
  return readFileSync((await dl.path())!);
}

test('Convert: video to another container this browser can write, verified by re-opening', async ({ page }) => {
  await page.goto('/tools/convert');
  const clip = await recordClip(page, 3);
  await main(page).locator('input[type=file]').first().setInputFiles({ name: 'clip.webm', mimeType: 'video/webm', buffer: clip });
  // The tab follows the file kind.
  await expect(page.getByRole('radio', { name: 'Audio & video' })).toHaveAttribute('aria-checked', 'true');
  const format = settings(page, /Convert settings/).getByRole('combobox', { name: 'Output format' });
  await expect(format).toBeVisible({ timeout: 30_000 });
  const options = await format.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  console.log('MEDIA writable for a video-only source:', options.join(','));
  const target = ['mp4', 'mkv', 'mov'].find((o) => options.includes(o));
  expect(target, 'at least one non-WebM video container is writable').toBeTruthy();
  await format.selectOption(target!);
  await page.getByRole('button', { name: 'Convert', exact: true }).click();
  const art = page.getByRole('article', { name: 'clip.webm' });
  await expect(art.getByText(/^Verified: \d/)).toBeVisible({ timeout: 90_000 });
  await expect(art.getByText(/^Verified: .*640×480/)).toBeVisible();
  expect(options).not.toContain('wav'); // the clip has no sound, so audio formats are not offered
  const out = await download(page, art.getByRole('button', { name: new RegExp(`Download clip-converted\\.${target}`) }));
  expect(out.length).toBeGreaterThan(1000);
  if (target === 'mp4' || target === 'mov') expect(out.subarray(4, 8).toString('ascii')).toBe('ftyp');
  if (target === 'mkv') expect(out.subarray(0, 4).toString('hex')).toBe('1a45dfa3');
});

test('Convert: audio to another audio format, verified', async ({ page }) => {
  await page.goto('/tools/convert');
  await main(page).locator('input[type=file]').first().setInputFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: tone(2) });
  const format = settings(page, /Convert settings/).getByRole('combobox', { name: 'Output format' });
  await expect(format).toBeVisible({ timeout: 30_000 });
  const options = await format.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  console.log('MEDIA writable for an audio source:', options.join(','));
  expect(options).not.toContain('mp4'); // no video formats for an audio-only file
  const target = ['ogg', 'm4a', 'flac'].find((o) => options.includes(o));
  expect(target, 'a compressed audio container is writable').toBeTruthy();
  await format.selectOption(target!);
  await page.getByRole('button', { name: 'Convert', exact: true }).click();
  const art = page.getByRole('article', { name: 'tone.wav' });
  await expect(art.getByText(/^Verified: 2\.\d s/)).toBeVisible({ timeout: 60_000 });
  const out = await download(page, art.getByRole('button', { name: /Download tone-converted/ }));
  if (target === 'ogg') expect(out.subarray(0, 4).toString('ascii')).toBe('OggS');
  if (target === 'flac') expect(out.subarray(0, 4).toString('ascii')).toBe('fLaC');
  expect(out.length).toBeLessThan(tone(2).length);
});

test('Compress: video is re-encoded smaller at a lower height, and says so honestly', async ({ page }) => {
  await page.goto('/tools/compress');
  const clip = await recordClip(page, 3);
  await main(page).locator('input[type=file]').first().setInputFiles({ name: 'clip.webm', mimeType: 'video/webm', buffer: clip });
  const side = settings(page, /Compress settings/);
  await expect(side.getByRole('combobox', { name: 'Output format' })).toBeVisible({ timeout: 30_000 });
  await side.getByRole('radio', { name: 'Smaller' }).click();
  await side.getByRole('combobox', { name: 'Maximum height' }).selectOption('480').catch(() => {});
  await side.getByRole('combobox', { name: 'Maximum height' }).selectOption({ label: '480 px' });
  await side.getByRole('button', { name: 'Compress', exact: true }).click();
  const art = page.getByRole('article', { name: 'clip.webm' });
  await expect(art.getByText(/^Verified: \d/)).toBeVisible({ timeout: 120_000 });
  const line = await art.getByText(/→/).first().innerText();
  console.log('MEDIA compress:', line.replace(/\s+/g, ' '));
  const smaller = /−/.test(line);
  // Either it is smaller, or the tool says plainly that it is not.
  if (!smaller) await expect(art.getByText(/not smaller than the original/)).toBeVisible();
});

test('Convert 3D: OBJ to binary STL, verified by reading it back', async ({ page }) => {
  await page.goto('/tools/convert');
  await page.getByRole('radio', { name: '3D models' }).click();
  const obj = 'v 0 0 0\nv 1 0 0\nv 0 2 0\nv 0 0 3\nf 1 2 3\nf 1 2 4\nf 1 3 4\nf 2 3 4\n';
  await main(page).locator('input[type=file]').first().setInputFiles({ name: 'tetra.obj', mimeType: '', buffer: Buffer.from(obj) });
  await page.getByRole('button', { name: 'Convert', exact: true }).click();
  const art = page.getByRole('article', { name: 'tetra.obj' });
  await expect(art.getByText(/Verified by reading it back: 4 triangles, 4 vertices, bounding box 1 × 2 × 3/)).toBeVisible({ timeout: 30_000 });
  const stl = await download(page, art.getByRole('button', { name: 'Download tetra-converted.stl' }));
  expect(stl.length).toBe(84 + 4 * 50);
  expect(stl.readUInt32LE(80)).toBe(4);

  await main(page).locator('input[type=file]').last().setInputFiles({ name: 'junk.obj', mimeType: '', buffer: Buffer.from('not a mesh') });
  await page.getByRole('button', { name: /^Convert 2 files$/ }).click();
  await expect(page.getByRole('article', { name: 'junk.obj' }).getByText(/could not be read/)).toBeVisible({ timeout: 30_000 });
});

test('Convert documents: images to one PDF, and PDF pages to PNG pictures', async ({ page }) => {
  await page.goto('/tools/convert');
  await page.getByRole('radio', { name: 'Documents' }).click();
  await main(page).locator('input[type=file]').first().setInputFiles([
    { name: 'a.png', mimeType: 'image/png', buffer: png(400, 200) },
    { name: 'b.png', mimeType: 'image/png', buffer: png(100, 300) },
  ]);
  await page.getByRole('radio', { name: 'Documents' }).click(); // images switch the tab to Images; come back
  await page.getByRole('button', { name: /^Make PDF from 2 images$/ }).click();
  await expect(main(page).getByText(/Verified: 2 pages, in the order listed/)).toBeVisible({ timeout: 30_000 });
  const pdfBytes = await download(page, main(page).getByRole('button', { name: 'Download a-images.pdf' }));
  const doc = await PDFDocument.load(pdfBytes);
  expect(doc.getPageCount()).toBe(2);
  expect(doc.getPage(0).getSize()).toEqual({ width: 300, height: 150 });
  expect(doc.getPage(1).getSize()).toEqual({ width: 75, height: 225 });

  // Now the other direction with a 2-page PDF.
  const src = await PDFDocument.create();
  src.addPage([200, 100]).drawText('Page one', { x: 20, y: 50, size: 14 });
  src.addPage([100, 200]).drawText('Two', { x: 20, y: 100, size: 14 });
  await main(page).locator('input[type=file]').last().setInputFiles({ name: 'two.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await src.save()) });
  await page.getByRole('radio', { name: 'Documents' }).click();
  await settings(page, /Convert settings/).getByRole('combobox', { name: 'Resolution' }).selectOption('72');
  await page.getByRole('button', { name: 'Convert PDF to images' }).click();
  await expect(main(page).getByText(/2 pages rendered at 72 DPI/)).toBeVisible({ timeout: 60_000 });
  const p1 = PNG.sync.read(await download(page, main(page).getByRole('button', { name: 'Download two-page-001.png' })));
  const p2 = PNG.sync.read(await download(page, main(page).getByRole('button', { name: 'Download two-page-002.png' })));
  expect([p1.width, p1.height, p2.width, p2.height]).toEqual([200, 100, 100, 200]);
});

test('Compress PDF: lossless rewrite keeps pages; flattening makes picture pages and warns', async ({ page }) => {
  const src = await PDFDocument.create();
  for (let i = 0; i < 3; i++) {
    const pg = src.addPage([300 + i, 400]);
    for (let l = 0; l < 30; l++) pg.drawText(`Line ${l} on page ${i + 1} of a small test document.`, { x: 20, y: 380 - l * 12, size: 9 });
  }
  const bytes = Buffer.from(await src.save({ useObjectStreams: false }));
  await page.goto('/tools/compress');
  await main(page).locator('input[type=file]').first().setInputFiles({ name: 'doc.pdf', mimeType: 'application/pdf', buffer: bytes });
  await expect(page.getByRole('radio', { name: 'PDF', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Compress', exact: true }).click();
  const art = page.getByRole('article', { name: 'doc.pdf' });
  await expect(art.getByText(/Verified: 3 pages\. Lossless/)).toBeVisible({ timeout: 30_000 });
  const out = await PDFDocument.load(await download(page, art.getByRole('button', { name: 'Download doc-compressed.pdf' })));
  expect(out.getPageCount()).toBe(3);
  expect(out.getPage(2).getWidth()).toBe(302);

  await settings(page, /Compress settings/).getByRole('radio', { name: 'Flatten to images' }).click();
  await expect(main(page).getByText(/Flattening cannot be undone in the output file/)).toBeVisible();
  await page.getByRole('button', { name: 'Compress', exact: true }).click();
  await expect(art.getByText(/Verified: 3 pages, each now a JPEG picture at 150 DPI/)).toBeVisible({ timeout: 60_000 });
  const flat = await PDFDocument.load(await download(page, art.getByRole('button', { name: 'Download doc-flattened.pdf' })));
  expect(flat.getPageCount()).toBe(3);
  expect(Math.round(flat.getPage(2).getWidth())).toBe(302);
  // A text-only PDF usually gets LARGER when flattened: the tool must say so rather than call it a success.
  await expect(art.getByText(/not smaller than the original/)).toBeVisible();
});
