import { expect, test } from '@playwright/test';

// Real engine, real recognition in headless Chromium: a canvas-drawn line of text is read back.
// The first run downloads the engine and model from this origin only.
const TEXT = 'HELLO PLAINKIT 2026';

test('Image to text reads drawn text and makes no outside requests', async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://localhost:4173');
  const outside: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol === 'data:' || u.protocol === 'blob:') return;
    if (u.origin !== origin.origin) outside.push(r.url());
  });

  await page.goto('/tools/ocr');
  const png = await page.evaluate(async (text) => {
    const c = document.createElement('canvas');
    c.width = 1000;
    c.height = 220;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#000000';
    g.font = 'bold 80px Arial, Helvetica, sans-serif';
    g.textBaseline = 'middle';
    g.fillText(text, 40, 110);
    const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/png'));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (const b of buf) bin += String.fromCharCode(b);
    return btoa(bin);
  }, TEXT);

  await page.locator('input[type=file]').first().setInputFiles({ name: 'line.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.getByRole('button', { name: 'Read text' }).click();

  const box = page.getByRole('textbox', { name: /Recognised text/ });
  await expect(box).toBeVisible({ timeout: 120_000 });
  await expect(box).toHaveValue(/HELLO/, { timeout: 120_000 });
  const value = await box.inputValue();
  expect(value).toContain('HELLO');
  expect(value).toContain('PLAINKIT');

  expect(outside, `requests left this origin: ${outside.join(', ')}`).toEqual([]);
});
