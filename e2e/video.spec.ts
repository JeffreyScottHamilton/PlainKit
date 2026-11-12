import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Scope to the tool's own area so the session tray's "Download <name>" buttons never match.
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

/** Reads duration and size of a WebM in a <video> element. MediaRecorder output reports Infinity until seeked. */
async function probeInPage(page: Page, bytes: Buffer, mime = 'video/webm') {
  return page.evaluate(
    ([b64, type]) =>
      new Promise<{ duration: number; width: number; height: number }>((resolve, reject) => {
        const bin = atob(b64);
        const u8 = Uint8Array.from(bin, (c) => c.charCodeAt(0));
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
        v.src = URL.createObjectURL(new Blob([u8], { type }));
      }),
    [bytes.toString('base64'), mime] as const,
  );
}

test.describe('Video: local trim', () => {
  test('trims 1.0 to 3.0 s to WebM and the download re-opens at 2 s with the source width', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await openVideo(page);
    const origin = new URL(page.url()).origin;
    const clip = await recordClip(page, 4);
    const source = await probeInPage(page, clip);
    expect(source.width).toBe(320);

    await main(page).locator('input[type="file"]').setInputFiles({ name: 'source.webm', mimeType: 'video/webm', buffer: clip });
    await expect(main(page).getByRole('heading', { level: 2, name: 'Trim a local video' })).toBeVisible();
    await expect(main(page).locator('.vd-facts dd').nth(1)).toContainText(/\d+\.\d+ s/);

    await main(page).getByLabel('Start (mm:ss.mmm)').fill('00:01.000');
    await main(page).getByLabel('End (mm:ss.mmm)').fill('00:03.000');
    const settings = page.getByRole('complementary', { name: 'Video settings' });
    await settings.getByRole('radio', { name: 'WebM' }).click();
    await settings.getByRole('button', { name: 'Trim and save' }).click();

    await expect(main(page).getByText(/Verified: duration 2\.\d\d s/)).toBeVisible({ timeout: 45_000 });
    await expect(main(page).getByText(/Copied without re-encoding|Re-encoded\./)).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      main(page).getByRole('button', { name: 'Download source-trimmed.webm' }).click(),
    ]);
    const out = readFileSync(await download.path());
    const probed = await probeInPage(page, out);
    expect(Math.abs(probed.duration - 2)).toBeLessThanOrEqual(0.6);
    expect(probed.width).toBe(source.width);

    // Every request during local trimming must stay on this origin.
    const external = requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'));
    expect(external).toEqual([]);
  });

  test('cancel during a conversion leaves the tool usable and a second run succeeds', async ({ page }) => {
    await openVideo(page);
    const clip = await recordClip(page, 8);
    await main(page).locator('input[type="file"]').setInputFiles({ name: 'long.webm', mimeType: 'video/webm', buffer: clip });
    await expect(main(page).getByLabel('End (mm:ss.mmm)')).toBeVisible();
    await main(page).getByLabel('Start (mm:ss.mmm)').fill('00:00.500');
    await main(page).getByLabel('End (mm:ss.mmm)').fill('00:07.500');

    const settings = page.getByRole('complementary', { name: 'Video settings' });
    await settings.getByRole('button', { name: 'Trim and save' }).click();
    await main(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(main(page).getByText('Canceled. Your original file is unchanged.')).toBeVisible();
    await expect(settings.getByRole('button', { name: 'Trim and save' })).toBeEnabled();

    await settings.getByRole('button', { name: 'Trim and save' }).click();
    await expect(main(page).getByText(/Verified: duration 7\.\d\d s/)).toBeVisible({ timeout: 60_000 });
  });
});

test.describe('Video: save from a link', () => {
  test('a CORS-enabled direct link is checked, downloaded as a result, and a blocked one explains CORS', async ({ page }) => {
    const clip = await recordClip(page, 2);
    await page.route('https://media.test/clip.webm', (route) =>
      route.fulfill({ status: 200, body: clip, headers: { 'access-control-allow-origin': '*', 'content-type': 'video/webm', 'content-length': String(clip.length) } }),
    );
    // A CORS header for a different origin: the browser must refuse the response for this page.
    await page.route('https://media.test/nocors.webm', (route) =>
      route.fulfill({ status: 200, body: clip, headers: { 'access-control-allow-origin': 'https://elsewhere.test', 'content-type': 'video/webm' } }),
    );

    await openVideo(page);
    const link = main(page).getByLabel('Direct media link (https://)');
    await link.fill('https://media.test/clip.webm');
    await expect(main(page).getByText('Your browser will request this file directly from media.test.')).toBeVisible();
    await main(page).getByRole('button', { name: 'Check link' }).click();
    await expect(main(page).getByText(/Direct file from media\.test: video\/webm/)).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      (async () => {
        await main(page).getByRole('button', { name: 'Download', exact: true }).click();
        await expect(main(page).getByRole('button', { name: 'Download clip.webm' })).toBeVisible();
        await main(page).getByRole('button', { name: 'Download clip.webm' }).click();
      })(),
    ]);
    expect(readFileSync(await download.path()).length).toBe(clip.length);

    await link.fill('https://media.test/nocors.webm');
    await main(page).getByRole('button', { name: 'Check link' }).click();
    await expect(main(page).getByText('The site did not allow this page to download the file (CORS), or it could not be reached.')).toBeVisible();
    await expect(main(page).getByText('Open the link in a new tab and save it from there, then drop the file here.')).toBeVisible();
  });

  test('HLS: real MPEG-TS (H.264) segments are remuxed to a verified MP4', async ({ page }) => {
    test.skip(!process.env.PK_BASE_URL, 'uses a dev-only fixture module; run against the dev server');
    await openVideo(page);
    const ts = await page.evaluate(async () => {
      // Dev server only: the fixture module is not part of the app bundle.
      const path = '/src/engines/video/testing.ts';
      const mod = (await import(/* @vite-ignore */ path)) as typeof import('../src/engines/video/testing');
      const bytes = await mod.makeMpegTsClip(6);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
      return btoa(bin);
    });
    const tsBytes = Buffer.from(ts, 'base64');
    await page.route('https://media.test/show.m3u8', (route) =>
      route.fulfill({ status: 200, body: '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\nseg0.ts\n#EXT-X-ENDLIST\n', headers: { 'access-control-allow-origin': '*', 'content-type': 'application/vnd.apple.mpegurl' } }),
    );
    await page.route('https://media.test/seg0.ts', (route) => route.fulfill({ status: 200, body: tsBytes, headers: { 'access-control-allow-origin': '*', 'content-type': 'video/mp2t' } }));

    const link = main(page).getByLabel('Direct media link (https://)');
    await link.fill('https://media.test/show.m3u8');
    await main(page).getByRole('button', { name: 'Check link' }).click();
    await expect(main(page).getByText(/HLS playlist from media\.test: 1 segments, 6\.00 s in total/)).toBeVisible();
    await main(page).getByRole('button', { name: 'Download', exact: true }).click();
    await expect(main(page).getByText('Remuxed to MP4 (duration verified).')).toBeVisible({ timeout: 90_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      main(page).getByRole('button', { name: 'Download show-remuxed.mp4' }).click(),
    ]);
    const mp4 = readFileSync(await download.path());
    expect(mp4.subarray(4, 8).toString('latin1')).toBe('ftyp');
    const probed = await probeInPage(page, mp4, 'video/mp4');
    expect(Math.abs(probed.duration - 6)).toBeLessThanOrEqual(1);
  });

  test('HLS: VOD segments are joined to a labelled .ts file of the exact total size; live, encrypted and platform links are refused', async ({ page }) => {
    const segs = [Buffer.alloc(1000, 1), Buffer.alloc(2500, 2), Buffer.alloc(700, 3)];
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'video/mp2t' };
    await page.route('https://media.test/vod.m3u8', (route) =>
      route.fulfill({ status: 200, body: '#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2.0,\nseg0.ts\n#EXTINF:2.0,\nseg1.ts\n#EXTINF:2.0,\nseg2.ts\n#EXT-X-ENDLIST\n', headers: { 'access-control-allow-origin': '*', 'content-type': 'application/vnd.apple.mpegurl' } }),
    );
    for (let i = 0; i < segs.length; i++) {
      await page.route(`https://media.test/seg${i}.ts`, (route) => route.fulfill({ status: 200, body: segs[i], headers: cors }));
    }
    await page.route('https://media.test/live.m3u8', (route) =>
      route.fulfill({ status: 200, body: '#EXTM3U\n#EXTINF:2.0,\nseg0.ts\n', headers: { 'access-control-allow-origin': '*', 'content-type': 'application/vnd.apple.mpegurl' } }),
    );
    await page.route('https://media.test/enc.m3u8', (route) =>
      route.fulfill({ status: 200, body: '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="k.bin"\n#EXTINF:2.0,\nseg0.ts\n#EXT-X-ENDLIST\n', headers: { 'access-control-allow-origin': '*', 'content-type': 'application/vnd.apple.mpegurl' } }),
    );

    await openVideo(page);
    const link = main(page).getByLabel('Direct media link (https://)');

    await link.fill('https://media.test/vod.m3u8');
    await main(page).getByRole('button', { name: 'Check link' }).click();
    await expect(main(page).getByText(/HLS playlist from media\.test: 3 segments, 6\.00 s in total/)).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      (async () => {
        await main(page).getByRole('button', { name: 'Download', exact: true }).click();
        await expect(main(page).getByRole('button', { name: 'Download vod-joined.ts' })).toBeVisible({ timeout: 30_000 });
        await main(page).getByRole('button', { name: 'Download vod-joined.ts' }).click();
      })(),
    ]);
    expect(readFileSync(await download.path()).length).toBe(segs.reduce((n, s) => n + s.length, 0));
    await expect(main(page).getByText('Joined .ts file. Some players cannot open it.')).toBeVisible();

    await link.fill('https://media.test/live.m3u8');
    await main(page).getByRole('button', { name: 'Check link' }).click();
    await expect(main(page).getByText('Live streams are not supported')).toBeVisible();

    await link.fill('https://media.test/enc.m3u8');
    await main(page).getByRole('button', { name: 'Check link' }).click();
    await expect(main(page).getByText('This stream is encrypted or DRM-protected and is not supported')).toBeVisible();

    await link.fill('https://www.youtube.com/watch?v=abc123');
    await expect(main(page).getByText('Video pages on platforms like this are not supported. This tool only saves direct media links.')).toBeVisible();
    await expect(main(page).getByRole('button', { name: 'Check link' })).toBeDisabled();
  });
});
