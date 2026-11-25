import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const main = (page: Page) => page.getByRole('main');

async function openVideo(page: Page) {
  await page.goto('/tools/video');
  await expect(page.getByRole('heading', { level: 1, name: 'Video' })).toBeVisible();
}

/** Records a changing canvas with MediaRecorder in the page. Returns the WebM bytes as base64. */
async function recordClip(page: Page, seconds: number): Promise<Buffer> {
  const b64 = await page.evaluate(async (secs) => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d')!;
    const rec = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm;codecs=vp8' });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    let frame = 0;
    const timer = window.setInterval(() => {
      ctx.fillStyle = `hsl(${(frame++ * 9) % 360} 80% 50%)`;
      ctx.fillRect(0, 0, 320, 240);
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

/** Reads the size of a WebM in a <video> element, as a browser shows it. */
async function probeInPage(page: Page, bytes: Buffer) {
  return page.evaluate(
    (b64) =>
      new Promise<{ duration: number; width: number; height: number }>((resolve, reject) => {
        const u8 = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const v = document.createElement('video');
        v.muted = true;
        const timer = window.setTimeout(() => reject(new Error('probe timed out')), 15000);
        const finish = () => {
          window.clearTimeout(timer);
          resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight });
        };
        v.onerror = () => reject(new Error('video element could not load the file'));
        v.onloadedmetadata = () => {
          if (Number.isFinite(v.duration)) return finish();
          v.ondurationchange = () => Number.isFinite(v.duration) && finish();
          v.currentTime = 1e101;
        };
        v.src = URL.createObjectURL(new Blob([u8], { type: 'video/webm' }));
      }),
    bytes.toString('base64'),
  );
}

test.describe('Video: rotate', () => {
  test('Rotate 90° clockwise re-renders the frames: the download is portrait (240 x 320) and is labelled as re-rendered', async ({ page }) => {
    await openVideo(page);
    const clip = await recordClip(page, 3);
    const source = await probeInPage(page, clip);
    expect(source.width).toBe(320);
    expect(source.height).toBe(240);

    await main(page).locator('input[type="file"]').setInputFiles({ name: 'source.webm', mimeType: 'video/webm', buffer: clip });
    await expect(main(page).getByRole('heading', { level: 2, name: 'Trim a local video' })).toBeVisible();

    const settings = page.getByRole('complementary', { name: 'Video settings' });
    await settings.getByRole('radio', { name: '90° clockwise' }).click();
    await settings.getByRole('button', { name: 'Trim and save' }).click();

    // WebM cannot carry rotation as metadata, so the result must say the frames were re-rendered.
    await expect(main(page).getByText('Rotated 90° by re-rendering the frames.')).toBeVisible({ timeout: 60_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      main(page).getByRole('button', { name: 'Download source-trimmed-rotated-90.webm' }).click(),
    ]);
    const probed = await probeInPage(page, readFileSync(await download.path()));
    expect(probed.width).toBe(source.height);
    expect(probed.height).toBe(source.width);
  });
});
