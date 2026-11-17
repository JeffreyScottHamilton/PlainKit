import { expect, test, type Download, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { decompressFrames, parseGIF } from 'gifuct-js';
import { makeJpeg } from './fixtures';
import { createRequire } from 'node:module';

const { GIFEncoder, quantize, applyPalette } = createRequire(import.meta.url)('gifenc') as typeof import('gifenc');

const main = (page: Page) => page.getByRole('main');

async function openGif(page: Page) {
  await page.goto('/tools/gif');
  await expect(page.getByRole('heading', { level: 1, name: 'GIF maker' })).toBeVisible();
}

function solidPng(w: number, h: number, rgb: [number, number, number]): Buffer {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    png.data[i * 4] = rgb[0];
    png.data[i * 4 + 1] = rgb[1];
    png.data[i * 4 + 2] = rgb[2];
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

/** Animated GIF made in the page by the app's own writer (dev server only). Colors and delays are known. */
async function animatedGif(_page: Page, frames: { rgb: [number, number, number]; ms: number }[], w: number, h: number): Promise<Buffer> {
  // Built in the test process with gifenc, so it works against the production build too.
  const enc = GIFEncoder();
  for (const f of frames) {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      d[i * 4] = f.rgb[0];
      d[i * 4 + 1] = f.rgb[1];
      d[i * 4 + 2] = f.rgb[2];
      d[i * 4 + 3] = 255;
    }
    const palette = quantize(d, 256);
    enc.writeFrame(applyPalette(d, palette), w, h, { palette, delay: f.ms, repeat: 0 });
  }
  enc.finish();
  return Buffer.from(enc.bytes());
}

/** WebM/MPEG-TS clip made in the page with mediabunny (dev server only). */
async function mpegTsClip(page: Page, seconds: number, fps: number): Promise<Buffer> {
  const b64 = await page.evaluate(
    async ({ seconds, fps }) => {
      const path = '/src/engines/video/testing.ts';
      const mod = (await import(/* @vite-ignore */ path)) as typeof import('../src/engines/video/testing');
      const bytes = await mod.makeMpegTsClip(seconds, fps);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
      return btoa(bin);
    },
    { seconds, fps },
  );
  return Buffer.from(b64, 'base64');
}

async function readDownload(d: Download): Promise<Buffer> {
  return readFileSync((await d.path())!);
}

/** Decodes a GIF with gifuct-js (independent of the app's own decoder) and returns its shape. */
function inspectGif(bytes: Buffer) {
  expect(bytes.subarray(0, 6).toString('ascii')).toBe('GIF89a');
  const ab = new Uint8Array(bytes).buffer;
  const gif = parseGIF(ab);
  const frames = decompressFrames(gif, true);
  return {
    width: gif.lsd.width,
    height: gif.lsd.height,
    count: frames.length,
    delays: frames.map((f) => f.delay),
    colors: frames.map((f) => [f.patch[0]!, f.patch[1]!, f.patch[2]!]),
  };
}

const strip = (page: Page) => main(page).getByRole('list', { name: /frames in play order/ });

async function waitForFrames(page: Page, n: number) {
  await expect(strip(page).locator('li')).toHaveCount(n, { timeout: 60_000 });
}

test.describe('GIF maker', () => {
  test('images to GIF: header, frame count, delay and size checked on the downloaded file', async ({ page }) => {
    await openGif(page);
    const jpeg = await makeJpeg(page, 64, 48);
    await main(page)
      .locator('input[type=file]')
      .first()
      .setInputFiles([
        { name: 'first.png', mimeType: 'image/png', buffer: solidPng(64, 48, [200, 40, 40]) },
        { name: 'second.jpg', mimeType: 'image/jpeg', buffer: jpeg },
        { name: 'third.png', mimeType: 'image/png', buffer: solidPng(64, 48, [40, 40, 200]) },
      ]);
    await waitForFrames(page, 3);

    await main(page).getByLabel('Width (pixels)').fill('32');
    await main(page).getByRole('button', { name: 'Make GIF', exact: true }).click();
    await expect(main(page).getByRole('heading', { name: 'Result' })).toBeVisible({ timeout: 60_000 });
    await expect(main(page).getByText('32×24 · 3 frames')).toBeVisible();

    const [dl] = await Promise.all([page.waitForEvent('download'), main(page).getByRole('button', { name: 'Download first-gif.gif' }).click()]);
    expect(dl.suggestedFilename()).toBe('first-gif.gif');
    const info = inspectGif(await readDownload(dl));
    expect(info.count).toBe(3);
    expect([info.width, info.height]).toEqual([32, 24]);
    // Stills default to 200 ms each.
    expect(info.delays).toEqual([200, 200, 200]);
    expect(info.colors[0]![0]).toBeGreaterThan(150);
  });

  test('animated GIF: reverse, remove a frame, export keeps the right order and delays', async ({ page }) => {
    await openGif(page);
    const gif = await animatedGif(
      page,
      [
        { rgb: [255, 0, 0], ms: 100 },
        { rgb: [0, 255, 0], ms: 200 },
        { rgb: [0, 0, 255], ms: 300 },
        { rgb: [255, 255, 255], ms: 400 },
      ],
      40,
      30,
    );
    await main(page).locator('input[type=file]').first().setInputFiles({ name: 'anim.gif', mimeType: 'image/gif', buffer: gif });
    await waitForFrames(page, 4);

    await main(page).getByRole('button', { name: 'Reverse order' }).click();
    await main(page).getByRole('button', { name: 'Remove frame 2' }).click();
    await waitForFrames(page, 3);
    await main(page).getByRole('button', { name: 'Make GIF', exact: true }).click();
    await expect(main(page).getByRole('heading', { name: 'Result' })).toBeVisible({ timeout: 60_000 });

    const [dl] = await Promise.all([page.waitForEvent('download'), main(page).getByRole('button', { name: 'Download anim-gif.gif' }).click()]);
    const info = inspectGif(await readDownload(dl));
    expect(info.count).toBe(3);
    expect(info.delays).toEqual([400, 200, 100]);
    // Reversed: white, blue, green, red. Removing frame 2 (blue) leaves white, green, red.
    const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]!) <= 12);
    expect(near(info.colors[0]!, [255, 255, 255])).toBe(true);
    expect(near(info.colors[1]!, [0, 255, 0])).toBe(true);
    expect(near(info.colors[2]!, [255, 0, 0])).toBe(true);
  });

  test('video to GIF: frame rate and trim set the frame count of the download', async ({ page }) => {
    test.skip(!process.env.PK_BASE_URL, 'uses a dev-only fixture module; run against the dev server');
    await openGif(page);
    const clip = await mpegTsClip(page, 2, 10);
    await main(page).locator('input[type=file]').first().setInputFiles({ name: 'clip.ts', mimeType: 'video/mp2t', buffer: clip });
    await expect(main(page).getByRole('heading', { name: 'Frames' })).toBeVisible({ timeout: 60_000 });
    await main(page).getByLabel('End (seconds)').fill('1');
    // One second at 10 frames per second is 10 frames; allow one frame of rounding at the boundary.
    await expect.poll(() => strip(page).locator('li').count(), { timeout: 60_000 }).toBeGreaterThanOrEqual(9);
    await expect.poll(() => strip(page).locator('li').count(), { timeout: 5_000 }).toBeLessThanOrEqual(11);
    const n = await strip(page).locator('li').count();
    await main(page).getByRole('button', { name: 'Make GIF', exact: true }).click();
    await expect(main(page).getByRole('heading', { name: 'Result' })).toBeVisible({ timeout: 90_000 });
    const [dl] = await Promise.all([page.waitForEvent('download'), main(page).getByRole('button', { name: 'Download clip-gif.gif' }).click()]);
    const info = inspectGif(await readDownload(dl));
    expect(info.count).toBe(n);
    expect(info.delays.every((d) => d === 100)).toBe(true);
  });

  test('corrupt and unsupported files get explicit messages', async ({ page }) => {
    await openGif(page);
    const junk = Buffer.from(Array.from({ length: 300 }, (_, i) => (i * 37) & 255));
    await main(page)
      .locator('input[type=file]')
      .first()
      .setInputFiles([{ name: 'notes.gif', mimeType: 'image/gif', buffer: Buffer.from('plain text, not a GIF') }]);
    await expect(main(page).getByText('Not used: notes.gif.')).toBeVisible();

    await main(page).getByRole('button', { name: 'Remove notes.gif' }).click();
    await main(page)
      .locator('input[type=file]')
      .first()
      .setInputFiles([{ name: 'corrupt.gif', mimeType: 'image/gif', buffer: Buffer.concat([Buffer.from('GIF89a'), junk]) }]);
    await expect(main(page).getByRole('alert')).toContainText(/could not be decoded|no frames/, { timeout: 30_000 });
    await expect(main(page).getByRole('button', { name: 'Make GIF', exact: true })).toBeDisabled();

    await main(page).getByRole('button', { name: 'Remove corrupt.gif' }).click();
    await main(page)
      .locator('input[type=file]')
      .first()
      .setInputFiles([{ name: 'broken.webm', mimeType: 'video/webm', buffer: junk }]);
    await expect(main(page).getByRole('alert')).toContainText(/could not be read/, { timeout: 30_000 });
  });

  test('phone width 390px: no page scroll, frame strip scrolls, controls at least 44px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openGif(page);
    await main(page)
      .locator('input[type=file]')
      .first()
      .setInputFiles([1, 2, 3, 4, 5].map((i) => ({ name: `s${i}.png`, mimeType: 'image/png', buffer: solidPng(120, 90, [i * 40, 80, 160]) })));
    await waitForFrames(page, 5);

    const scroll = await page.evaluate(() => ({ page: document.documentElement.scrollWidth - document.documentElement.clientWidth, strip: (document.querySelector('ol.gif-strip') as HTMLElement).scrollWidth - (document.querySelector('ol.gif-strip') as HTMLElement).clientWidth }));
    expect(scroll.page).toBeLessThanOrEqual(0);
    expect(scroll.strip).toBeGreaterThan(0);

    const make = await main(page).getByRole('button', { name: 'Make GIF', exact: true }).boundingBox();
    expect(make!.height).toBeGreaterThanOrEqual(44);
    const move = await main(page).getByRole('button', { name: 'Move frame 1 later' }).boundingBox();
    expect(move!.height).toBeGreaterThanOrEqual(44);
    expect(move!.width).toBeGreaterThanOrEqual(44);
  });
});
