import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Real model, real inference (Whisper tiny.en, 8-bit, ONNX Runtime Web single-thread WASM) in headless Chromium.
// Fixture e2e/fixtures/jfk.wav: the first 11 s of John F. Kennedy's 1961 inaugural address
// ("...ask not what your country can do for you, ask what you can do for your country").
// Source: Xenova/transformers.js-docs dataset (jfk.wav), also tests/jfk.flac in openai/whisper (MIT).
// A US federal-government speech of 1961, treated as public domain. Converted to mono 22.05 kHz 16-bit with ffmpeg.
const JFK = readFileSync('e2e/fixtures/jfk.wav');
const KEY_WORDS = ['fellow', 'americans', 'ask', 'not', 'what', 'your', 'country', 'can', 'do', 'for', 'you'];
const MIN_HITS = 8;

const main = (page: Page) => page.locator('.pk-tool__main');
const section = (page: Page) => page.getByRole('region', { name: 'Transcribe audio or video (experimental)' });

async function chooseAudio(page: Page, name: string, buffer: Buffer, mimeType: string) {
  const chooser = page.waitForEvent('filechooser');
  await section(page).getByRole('button', { name: 'Choose audio or video file' }).click();
  await (await chooser).setFiles({ name, mimeType, buffer });
}

const trackRequests = (page: Page) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  return urls;
};

function assertSameOrigin(urls: string[], origin: string) {
  const external = urls.filter((u) => !u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).origin !== origin);
  expect(external, `external requests: ${external.join(', ')}`).toEqual([]);
}

const startMs = (t: string) => {
  const m = /^(\d+):(\d+):(\d+)\.(\d+)$/.exec(t.trim());
  return m ? ((Number(m[1]) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 + Number(m[4]) : NaN;
};

test('transcribes real speech on this device, same-origin only', async ({ page, baseURL }, info) => {
  test.setTimeout(240_000);
  const urls = trackRequests(page);
  await page.goto('/tools/subtitles');
  await expect(section(page)).toBeVisible();
  // Before first use: model, exact size, licence, language, on-device statement.
  await expect(section(page).getByText(/Whisper tiny\.en/)).toBeVisible();
  await expect(section(page).getByText(/Download on first use: 5\d\.\d MB/)).toBeVisible();
  await expect(section(page).getByText(/Language: English only/)).toBeVisible();
  await expect(section(page).getByText(/resampled to 16 kHz/)).toBeVisible();
  await expect(section(page).getByText(/Automatic transcription makes mistakes/)).toBeVisible();

  await chooseAudio(page, 'jfk.wav', JFK, 'audio/wav');
  await section(page).getByRole('button', { name: 'Transcribe' }).click();
  await expect(main(page).locator('.sub-table tbody tr').first()).toBeVisible({ timeout: 200_000 });

  const texts = await main(page).locator('.sub-table textarea').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));
  const words = new Set(texts.join(' ').toLowerCase().match(/[a-z]+/g) ?? []);
  const hits = KEY_WORDS.filter((w) => words.has(w));
  console.log(`transcript: ${JSON.stringify(texts)}`);
  expect(hits.length, `matched ${hits.join(',')} of ${KEY_WORDS.join(',')}`).toBeGreaterThanOrEqual(MIN_HITS);

  const starts = (await main(page).locator('input[id^="sub-start-"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).map(startMs);
  expect(starts.every((n) => Number.isFinite(n))).toBe(true);
  for (let i = 1; i < starts.length; i++) expect(starts[i]!).toBeGreaterThan(starts[i - 1]!);
  await expect(main(page).getByText(/0 errors/)).toBeVisible();

  const timing = (await section(page).getByText(/^Transcribed .* on this device\./).textContent()) ?? '';
  expect(timing).toMatch(/Transcribed 11 s of audio in \d+(\.\d)? s on this device\./);
  console.log(timing);
  info.annotations.push({ type: 'measured', description: timing });

  assertSameOrigin(urls, new URL(baseURL ?? page.url()).origin);
  expect(urls.some((u) => !u.startsWith('data:') && !u.startsWith('blob:') && /huggingface|jsdelivr|unpkg|cdn/.test(new URL(u).hostname))).toBe(false);
  expect(urls.filter((u) => u.includes('/models/whisper-tiny-en/')).length).toBeGreaterThanOrEqual(5);
  console.log(`requests under /models or /engines: ${urls.filter((u) => /\/(models|engines)\//.test(u)).map((u) => new URL(u).pathname).join(' ')}`);
});

test('existing cues need confirmation; replace is one undo step; cancel then retry works', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/tools/subtitles');
  const SRT = '1\n00:00:01,000 --> 00:00:02,000\nFirst\n\n2\n00:00:03,000 --> 00:00:04,000\nSecond\n';
  await main(page).locator('input[type="file"]').setInputFiles({ name: 'old.srt', mimeType: 'application/x-subrip', buffer: Buffer.from(SRT) });
  await expect(main(page).locator('.sub-table tbody tr')).toHaveCount(2);

  await chooseAudio(page, 'jfk.wav', JFK, 'audio/wav');
  await section(page).getByRole('button', { name: 'Transcribe' }).click();
  await section(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(section(page).getByText('Canceled.')).toBeVisible();
  await expect(main(page).locator('.sub-table tbody tr')).toHaveCount(2); // untouched

  await section(page).getByRole('button', { name: 'Transcribe' }).click();
  await expect(section(page).getByRole('button', { name: 'Replace current subtitles' })).toBeVisible({ timeout: 200_000 });
  await expect(main(page).locator('.sub-table textarea').first()).toHaveValue('First'); // not replaced yet
  await section(page).getByRole('button', { name: 'Keep current' }).click();
  await expect(main(page).locator('.sub-table tbody tr')).toHaveCount(2);
  await expect(section(page).getByText(/Kept the current subtitles/)).toBeVisible();

  // Second run: replace, then one Undo brings the old cues back.
  await section(page).getByRole('button', { name: 'Transcribe' }).click();
  await section(page).getByRole('button', { name: 'Replace current subtitles' }).click({ timeout: 200_000 });
  await expect(main(page).locator('.sub-table textarea').first()).not.toHaveValue('First');
  await expect(main(page).locator('.sub-table textarea').first()).toHaveValue(/Americans/i);
  await main(page).getByRole('button', { name: 'Undo' }).click();
  await expect(main(page).locator('.sub-table tbody tr')).toHaveCount(2);
  await expect(main(page).locator('.sub-table textarea').first()).toHaveValue('First');
});

test('refuses recordings over 30 minutes and warns over 10', async ({ page }) => {
  await page.goto('/tools/subtitles');
  const wav = (sec: number) => {
    const rate = 8000;
    const n = sec * rate;
    const b = Buffer.alloc(44 + n, 128);
    b.write('RIFF', 0);
    b.writeUInt32LE(36 + n, 4);
    b.write('WAVEfmt ', 8);
    b.writeUInt32LE(16, 16);
    b.writeUInt16LE(1, 20);
    b.writeUInt16LE(1, 22);
    b.writeUInt32LE(rate, 24);
    b.writeUInt32LE(rate, 28);
    b.writeUInt16LE(1, 32);
    b.writeUInt16LE(8, 34);
    b.write('data', 36);
    b.writeUInt32LE(n, 40);
    return b;
  };
  await chooseAudio(page, 'long.wav', wav(31 * 60), 'audio/wav');
  await expect(section(page).getByText(/accepts up to 30 minutes/)).toBeVisible();
  await expect(section(page).getByRole('button', { name: 'Transcribe' })).toBeDisabled();
  await chooseAudio(page, 'mid.wav', wav(11 * 60), 'audio/wav');
  await expect(section(page).getByText(/can take a long time/)).toBeVisible();
  await expect(section(page).getByRole('button', { name: 'Transcribe' })).toBeEnabled();
});
