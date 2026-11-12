import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { encodeWav16, parseWav } from '../src/engines/audio/wav';
import { decodedSize } from './fixtures';

const heading = (page: Page, name: string) => page.getByRole('heading', { level: 1, name, exact: true });

test.describe('audio: extract WAV', () => {
  test('a 1 s 440 Hz WAV extracts to a valid 44.1 kHz 16-bit WAV with the same duration and audible samples', async ({ page }) => {
    await page.goto('/tools/audio-stems');
    await expect(heading(page, 'Audio and stems')).toBeVisible();

    const sr = 48000;
    const samples = Float32Array.from({ length: sr }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr));
    const buffer = Buffer.from(encodeWav16([samples], sr));
    await page.getByRole('main').locator('input[type=file]').first().setInputFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer });
    await expect(page.getByRole('main').getByText('tone.wav').first()).toBeVisible();

    await page.getByRole('combobox', { name: 'Sample rate' }).selectOption('44100');
    await page.getByRole('main').getByRole('button', { name: 'Extract audio (WAV)' }).click();

    const download = page.getByRole('main').getByRole('button', { name: 'Download tone-audio.wav', exact: true });
    await expect(download).toBeVisible({ timeout: 45_000 });
    const [dl] = await Promise.all([page.waitForEvent('download'), download.click()]);
    const out = new Uint8Array(readFileSync((await dl.path())!));

    const info = parseWav(out);
    expect(info.sampleRate).toBe(44100);
    expect(info.bitsPerSample).toBe(16);
    expect(info.channels).toBe(1);
    expect(info.durationSec).toBeGreaterThan(0.95);
    expect(info.durationSec).toBeLessThan(1.05);

    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    let peak = 0;
    for (let i = 0; i < info.frames; i++) peak = Math.max(peak, Math.abs(view.getInt16(info.dataOffset + i * 2, true)));
    expect(peak).toBeGreaterThan(8000);
  });
});

test.describe('ID photo: photo and print sheet', () => {
  test('35 x 45 mm photo exports as a 413 x 531 JPEG, and the sheet is a 1-page PDF at paper size', async ({ page }) => {
    await page.goto('/tools/id-photo');
    await expect(heading(page, 'ID photo')).toBeVisible();

    const png = await page.evaluate(async () => {
      const c = new OffscreenCanvas(1200, 1600);
      const ctx = c.getContext('2d')!;
      const g = ctx.createLinearGradient(0, 0, 1200, 1600);
      g.addColorStop(0, '#3a6699');
      g.addColorStop(1, '#a36a33');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1200, 1600);
      ctx.fillStyle = '#f0d9c4';
      ctx.beginPath();
      ctx.arc(600, 700, 300, 0, Math.PI * 2);
      ctx.fill();
      const b = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
      let s = '';
      for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
      return btoa(s);
    });
    await page.getByRole('main').locator('input[type=file]').first().setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });

    await page.getByRole('combobox', { name: 'Document preset' }).selectOption('uk-passport');
    await expect(page.getByText('Photo: 35 × 45 mm · 413 × 531 px at 300 DPI')).toBeVisible();

    // Single photo
    await page.getByRole('main').getByRole('button', { name: 'Export photo', exact: true }).click();
    const jpgBtn = page.getByRole('main').getByRole('button', { name: 'Download portrait-id.jpg', exact: true });
    await expect(jpgBtn).toBeVisible({ timeout: 45_000 });
    const [jpgDl] = await Promise.all([page.waitForEvent('download'), jpgBtn.click()]);
    const jpg = new Uint8Array(readFileSync((await jpgDl.path())!));
    expect(jpg[0]).toBe(0xff);
    expect(jpg[1]).toBe(0xd8);
    expect(await decodedSize(page, jpg, 'image/jpeg')).toEqual({ w: 413, h: 531 });
    if (String.fromCharCode(...jpg.subarray(6, 11)) === 'JFIF\0') expect(((jpg[14] ?? 0) << 8) | (jpg[15] ?? 0)).toBe(300);

    // Print sheet at actual size
    await page.getByRole('main').getByRole('button', { name: 'Export print sheet (PDF)', exact: true }).click();
    const pdfBtn = page.getByRole('main').getByRole('button', { name: 'Download portrait-id-sheet.pdf', exact: true });
    await expect(pdfBtn).toBeVisible({ timeout: 45_000 });
    const [pdfDl] = await Promise.all([page.waitForEvent('download'), pdfBtn.click()]);
    const pdf = await PDFDocument.load(readFileSync((await pdfDl.path())!));
    const pages = pdf.getPages();
    expect(pages.length).toBe(1);
    const { width, height } = pages[0]!.getSize();
    const [short, long] = [width, height].sort((a, b) => a - b);
    expect(Math.abs(short! - 288)).toBeLessThan(0.01);
    expect(Math.abs(long! - 432)).toBeLessThan(0.01);
  });
});
