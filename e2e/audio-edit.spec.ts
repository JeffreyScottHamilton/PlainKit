import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { encodeWav16, parseWav } from '../src/engines/audio/wav';

// Trims a generated 4 s sine to 1.0-3.0 s and checks the exported WAV duration, then normalizes and checks the peak.

const RATE = 48000;
const sine = Float32Array.from({ length: RATE * 4 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / RATE));
const WAV = Buffer.from(encodeWav16([sine], RATE));

/** Peak level in dBFS of the 16-bit PCM samples in a WAV file. */
function peakDbfs(bytes: Uint8Array): number {
  const info = parseWav(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset + info.dataOffset, info.dataBytes);
  let peak = 0;
  for (let i = 0; i + 1 < info.dataBytes; i += 2) peak = Math.max(peak, Math.abs(view.getInt16(i, true)));
  return 20 * Math.log10(peak / 32767);
}

test('audio trim exports the selection as WAV and normalizes to -1 dBFS', async ({ page }) => {
  await page.goto('/tools/audio-edit');
  await page.getByRole('main').locator('input[type=file]').first().setInputFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: WAV });

  const start = page.getByLabel('Start time');
  const end = page.getByLabel('End time');
  await expect(start).toBeVisible({ timeout: 30_000 });

  await start.fill('00:01.0');
  await start.press('Enter');
  await end.fill('00:03.0');
  await end.press('Enter');
  await expect(end).toHaveValue('00:03.0');

  // Keyboard: the start handle steps 0.1 s per arrow press.
  const startHandle = page.getByRole('slider', { name: 'Selection start' });
  await startHandle.focus();
  await page.keyboard.press('ArrowRight');
  await expect(startHandle).toHaveAttribute('aria-valuenow', '1.1');
  await page.keyboard.press('ArrowLeft');
  await expect(startHandle).toHaveAttribute('aria-valuenow', '1');

  // Plain trim.
  await page.getByRole('button', { name: 'Export WAV' }).click();
  const trimmed = page.getByRole('main').getByRole('button', { name: /Download .*trimmed\.wav/ });
  await expect(trimmed).toBeVisible({ timeout: 60_000 });
  const dl1 = page.waitForEvent('download');
  await trimmed.click();
  const f1 = await (await dl1).path();
  const info = parseWav(new Uint8Array(readFileSync(f1)));
  expect(Math.abs(info.durationSec - 2)).toBeLessThanOrEqual(0.02);

  // Normalized export.
  await page.getByRole('checkbox', { name: 'Normalize to -1 dBFS peak' }).check();
  await page.getByRole('button', { name: 'Export WAV' }).click();
  const normalized = page.getByRole('main').getByRole('button', { name: /Download .*normalized\.wav/ });
  await expect(normalized).toBeVisible({ timeout: 60_000 });
  const dl2 = page.waitForEvent('download');
  await normalized.click();
  const f2 = await (await dl2).path();
  expect(Math.abs(peakDbfs(new Uint8Array(readFileSync(f2))) - -1)).toBeLessThanOrEqual(0.1);
});
