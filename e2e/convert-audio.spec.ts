import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { encodeWav16 } from '../src/engines/audio/wav';

const main = (p: Page) => p.getByRole('main');
const side = (p: Page) => p.getByRole('complementary', { name: /Convert settings/ });

function tone(seconds: number): Buffer {
  const rate = 44100;
  const l = new Float32Array(rate * seconds);
  const r = new Float32Array(rate * seconds);
  for (let i = 0; i < l.length; i++) {
    l[i] = 0.4 * Math.sin((2 * Math.PI * 440 * i) / rate);
    r[i] = 0.4 * Math.sin((2 * Math.PI * 660 * i) / rate);
  }
  return Buffer.from(encodeWav16([l, r], rate));
}

/** A short clip WITH sound: a changing canvas plus a 440 Hz tone, recorded in the page. */
async function recordClipWithSound(page: Page, seconds: number): Promise<Buffer> {
  const b64 = await page.evaluate(async (secs) => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d')!;
    const ac = new AudioContext();
    const osc = ac.createOscillator();
    const dest = ac.createMediaStreamDestination();
    osc.frequency.value = 440;
    osc.connect(dest);
    osc.start();
    const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8,opus' });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    let f = 0;
    const timer = window.setInterval(() => {
      ctx.fillStyle = `hsl(${(f++ * 9) % 360} 80% 50%)`;
      ctx.fillRect(0, 0, 320, 240);
    }, 33);
    const stopped = new Promise<void>((res) => (rec.onstop = () => res()));
    rec.start(100);
    await new Promise((res) => window.setTimeout(res, secs * 1000));
    rec.stop();
    window.clearInterval(timer);
    osc.stop();
    await stopped;
    await ac.close();
    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, seconds);
  return Buffer.from(b64, 'base64');
}

async function convert(page: Page, name: string, mime: string, buffer: Buffer, target: string, ext: string): Promise<Buffer> {
  await page.goto('/tools/convert');
  await main(page).locator('input[type=file]').first().setInputFiles({ name, mimeType: mime, buffer });
  const format = side(page).getByRole('combobox', { name: 'Output format' });
  await expect(format).toBeVisible({ timeout: 30_000 });
  await expect(format.locator(`option[value="${target}"]`)).toHaveCount(1, { timeout: 30_000 });
  await format.selectOption(target);
  await page.getByRole('button', { name: 'Convert', exact: true }).click();
  const art = page.getByRole('article', { name });
  await expect(art.getByText(/^Verified \(duration and tracks\)/)).toBeVisible({ timeout: 120_000 });
  console.log(`AUDIO ${name} -> ${target}: ${(await art.getByText(/^Verified/).innerText()).replace(/\s+/g, ' ')}`);
  const base = name.replace(/\.[^.]+$/, '');
  const [dl] = await Promise.all([page.waitForEvent('download'), art.getByRole('button', { name: `Download ${base}-converted.${ext}` }).click()]);
  return readFileSync((await dl.path())!);
}

/** Decodes with the browser's own decoder, independent of the library that wrote the file. */
async function decodedSeconds(page: Page, bytes: Buffer): Promise<{ seconds: number; channels: number; peak: number }> {
  return page.evaluate(async (b64) => {
    const u8 = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ac = new AudioContext();
    const buf = await ac.decodeAudioData(u8.buffer);
    let peak = 0;
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i += 97) peak = Math.max(peak, Math.abs(d[i]!));
    await ac.close();
    return { seconds: buf.duration, channels: buf.numberOfChannels, peak };
  }, bytes.toString('base64'));
}

test('WAV to MP3: a real MP3 that the browser decodes back to the same length', async ({ page }) => {
  const out = await convert(page, 'tone.wav', 'audio/wav', tone(3), 'mp3', 'mp3');
  const sync = out[0] === 0xff && (out[1]! & 0xe0) === 0xe0;
  expect(sync || out.subarray(0, 3).toString('ascii') === 'ID3').toBe(true);
  expect(out.length).toBeLessThan(tone(3).length / 3);
  const d = await decodedSeconds(page, out);
  expect(d.seconds).toBeGreaterThan(2.9);
  expect(d.seconds).toBeLessThan(3.2);
  expect(d.channels).toBe(2);
  expect(d.peak).toBeGreaterThan(0.2);
});

test('video with sound to MP3: the picture is dropped and the sound is kept', async ({ page }) => {
  await page.goto('/tools/convert');
  const clip = await recordClipWithSound(page, 3);
  const out = await convert(page, 'clip.webm', 'video/webm', clip, 'mp3', 'mp3');
  const d = await decodedSeconds(page, out);
  expect(d.seconds).toBeGreaterThan(2.4);
  expect(d.seconds).toBeLessThan(3.6);
  expect(d.peak).toBeGreaterThan(0.2);
});

test('WAV to FLAC and to M4A (AAC): correct containers that decode back', async ({ page }) => {
  const flac = await convert(page, 'tone.wav', 'audio/wav', tone(2), 'flac', 'flac');
  expect(flac.subarray(0, 4).toString('ascii')).toBe('fLaC');
  expect((await decodedSeconds(page, flac)).seconds).toBeCloseTo(2, 1);
  const m4a = await convert(page, 'tone.wav', 'audio/wav', tone(2), 'm4a', 'm4a');
  expect(m4a.subarray(4, 8).toString('ascii')).toBe('ftyp');
  const d = await decodedSeconds(page, m4a);
  expect(d.seconds).toBeGreaterThan(1.9);
  expect(d.seconds).toBeLessThan(2.2);
});

test('MP4 is only offered when it can hold H.264; a VP8 clip is never copied into an MP4', async ({ page }) => {
  await page.goto('/tools/convert');
  const clip = await recordClipWithSound(page, 3);
  await main(page).locator('input[type=file]').first().setInputFiles({ name: 'clip.webm', mimeType: 'video/webm', buffer: clip });
  const format = side(page).getByRole('combobox', { name: 'Output format' });
  await expect(format).toBeVisible({ timeout: 30_000 });
  await expect(format.locator('option[value="mp3"]')).toHaveCount(1, { timeout: 30_000 });
  const options = await format.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  console.log('AUDIO options for a VP8+Opus clip:', options.join(','));
  if (options.includes('mp4')) {
    // This browser has an H.264 encoder: the MP4 must really contain H.264 and AAC.
    await convert(page, 'clip.webm', 'video/webm', clip, 'mp4', 'mp4');
    await expect(page.getByRole('article', { name: 'clip.webm' }).getByText(/^Verified .*(avc|hevc).* aac /)).toBeVisible();
  } else {
    // No H.264 encoder here (true of the test browser): MP4 is not offered, and the page says so.
    await expect(main(page).getByText(/Not offered: .*MP4/)).toBeVisible();
    expect(options).toContain('webm');
  }
});
