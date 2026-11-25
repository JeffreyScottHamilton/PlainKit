import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

// Scope to the tool's own area so the session tray's "Download <name>" buttons never match.
const main = (page: Page) => page.getByRole('main');

async function openVideo(page: Page) {
  await page.goto('/tools/video');
  await expect(page.getByRole('heading', { level: 1, name: 'Video' })).toBeVisible();
}

/** Records a changing 320x240 canvas with a 440 Hz tone, so the clip has an audio track. Returns WebM bytes as base64. */
async function recordClipWithAudio(page: Page, seconds: number): Promise<Buffer> {
  const b64 = await page.evaluate(async (secs) => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d')!;
    const audioCtx = new AudioContext();
    await audioCtx.resume();
    const osc = audioCtx.createOscillator();
    osc.frequency.value = 440;
    const dest = audioCtx.createMediaStreamDestination();
    osc.connect(dest);
    osc.start();
    const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
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
    osc.stop();
    await stopped;
    await audioCtx.close();
    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
    return btoa(bin);
  }, seconds);
  return Buffer.from(b64, 'base64');
}

/** True when the browser's audio decoder finds an audio track in the file. Video-only files reject. */
async function hasAudioTrack(page: Page, bytes: Buffer): Promise<boolean> {
  return page.evaluate(async (b64) => {
    const bin = atob(b64);
    const buf = Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer;
    const ctx = new AudioContext();
    try {
      await ctx.decodeAudioData(buf);
      return true;
    } catch {
      return false;
    } finally {
      await ctx.close();
    }
  }, bytes.toString('base64'));
}

test('Video: Remove audio exports a clip with no audio track, and the button names the action', async ({ page }) => {
  await openVideo(page);
  const clip = await recordClipWithAudio(page, 4);
  await main(page).locator('input[type="file"]').setInputFiles({ name: 'talk.webm', mimeType: 'video/webm', buffer: clip });
  await expect(main(page).getByRole('heading', { level: 2, name: 'Trim a local video' })).toBeVisible();
  await expect(main(page).locator('.vd-facts dd').nth(1)).toContainText(/\d+\.\d+ s/);
  await main(page).getByLabel('Start (mm:ss.mmm)').fill('00:01.000');
  await main(page).getByLabel('End (mm:ss.mmm)').fill('00:03.000');

  const settings = page.getByRole('complementary', { name: 'Video settings' });
  expect(await hasAudioTrack(page, clip)).toBe(true);
  await settings.getByRole('radio', { name: 'WebM' }).click();
  await settings.getByLabel('Remove audio').check();
  await expect(settings.getByRole('button', { name: 'Trim, remove audio and save' })).toBeVisible();
  await settings.getByRole('button', { name: 'Trim, remove audio and save' }).click();

  await expect(main(page).getByText(/Verified: duration \d+\.\d+ s/)).toBeVisible({ timeout: 45_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    main(page).getByRole('button', { name: 'Download talk-muted.webm' }).click(),
  ]);
  const out = readFileSync(await download.path());
  expect(await hasAudioTrack(page, out)).toBe(false);
});

test('Video: Save this frame as image produces a 320x240 PNG in the session tray', async ({ page }) => {
  await openVideo(page);
  const clip = await recordClipWithAudio(page, 2);
  await main(page).locator('input[type="file"]').setInputFiles({ name: 'still.webm', mimeType: 'video/webm', buffer: clip });
  await expect(main(page).getByRole('heading', { level: 2, name: 'Trim a local video' })).toBeVisible();

  await main(page).getByRole('button', { name: 'Save this frame as image' }).click();
  await expect(main(page).getByText(/Saved still-frame-.*\.png to this session\. It is in the session tray\./)).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /^Download still-frame-.*\.png$/ }).click(),
  ]);
  const bytes = readFileSync(await download.path());
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  const png = PNG.sync.read(bytes);
  expect(png.width).toBe(320);
  expect(png.height).toBe(240);
});
