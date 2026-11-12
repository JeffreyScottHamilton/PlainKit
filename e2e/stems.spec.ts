import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { encodeWav16, parseWav } from '../src/engines/audio/wav';

// Runs the real Spleeter model in the browser on a SYNTHETIC mix (a vocal-like FM voice, bass sine,
// noise-burst drums, a sine chord). It is not music: this proves the pipeline works end to end and
// the outputs are sane, not that separation sounds good.
const SR = 44100;
const SECONDS = 6;

function synthMix(): Float32Array[] {
  const n = SR * SECONDS;
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const notes = [220, 247, 262, 294, 330, 294];
  let ph = 0;
  let bph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f0 = notes[Math.floor(t / 0.5) % notes.length]! * (1 + 0.006 * Math.sin(2 * Math.PI * 5.5 * t));
    ph += (2 * Math.PI * f0) / SR;
    const env = Math.min(1, (t % 0.5) / 0.04) * Math.min(1, (0.5 - (t % 0.5)) / 0.06);
    let v = 0;
    for (let h = 1; h <= 12; h++) v += (Math.sin(h * ph) / h) * Math.exp(-(((h * f0 - 900) / 700) ** 2));
    v *= 0.55 * env;
    bph += (2 * Math.PI * [55, 65.4][Math.floor(t) % 2]!) / SR;
    const b = 0.5 * (Math.sin(bph) + 0.3 * Math.sin(2 * bph));
    const c = (Math.sin(2 * Math.PI * 392 * t) + 0.8 * Math.sin(2 * Math.PI * 494 * t) + 0.6 * Math.sin(2 * Math.PI * 587 * t)) * 0.12;
    L[i] = v * 0.95 + b + c * 1.1;
    R[i] = v * 0.85 + b + c * 0.8;
  }
  for (let s = 0; s < n; s += SR / 2) {
    for (let j = 0; j < 0.18 * SR && s + j < n; j++) {
      const tt = j / SR;
      const k = 0.8 * Math.sin(2 * Math.PI * (45 * tt + (80 * (1 - Math.exp(-25 * tt))) / 25)) * Math.exp(-tt * 22);
      L[s + j]! += k;
      R[s + j]! += k;
    }
    if (Math.floor(s / (SR / 2)) % 2 === 1)
      for (let j = 0; j < 0.15 * SR && s + j < n; j++) {
        const sn = 0.35 * rnd() * Math.exp((-j / SR) * 28);
        L[s + j]! += sn;
        R[s + j]! += sn * 0.9;
      }
  }
  return [L, R];
}

const STEMS = ['vocals', 'drums', 'bass', 'other'] as const;
function samples(wav: Uint8Array, ch: number): Float32Array {
  const info = parseWav(wav);
  const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  return Float32Array.from({ length: info.frames }, (_, i) => v.getInt16(info.dataOffset + (i * info.channels + ch) * 2, true) / 32768);
}
function corr(a: Float32Array, b: Float32Array): number {
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < a.length; i++) {
    sab += a[i]! * b[i]!;
    saa += a[i]! * a[i]!;
    sbb += b[i]! * b[i]!;
  }
  return sab / Math.sqrt(saa * sbb);
}

test.describe('audio stems (real model, synthetic mix)', () => {
  test('separates into 4 valid stems; cancel then rerun works; everything stays same-origin', async ({ page }) => {
    test.setTimeout(240_000);
    const foreign: string[] = [];
    const modelRequests: string[] = [];
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (u.protocol === 'data:' || u.protocol === 'blob:') return;
      if (u.origin !== new URL(page.url() === 'about:blank' ? r.url() : page.url()).origin) foreign.push(r.url());
      if (u.pathname.startsWith('/models/')) modelRequests.push(u.pathname);
    });

    await page.goto('/tools/audio-stems');
    const mixCh = synthMix();
    const mixWav = Buffer.from(encodeWav16(mixCh, SR));
    await page.getByRole('main').locator('input[type=file]').first().setInputFiles({ name: 'mix.wav', mimeType: 'audio/wav', buffer: mixWav });

    const panel = page.locator('#stems-h').locator('xpath=ancestor::section');
    await expect(panel.getByText('Experimental', { exact: true })).toBeVisible();
    await expect(panel.getByText(/Spleeter 4 stems/)).toBeVisible();
    await expect(panel.getByText(/Separation is imperfect/)).toBeVisible();
    await expect(panel.getByText(/Estimated time/)).toBeVisible();
    const start = panel.getByRole('button', { name: 'Separate into 4 stems' });

    // First run: cancel while the worker is processing.
    await start.click();
    await expect(panel.getByText(/Processing/).first()).toBeVisible({ timeout: 120_000 });
    await panel.getByRole('button', { name: 'Cancel' }).click();
    await expect(panel.getByText(/^Canceled\./)).toBeVisible();
    await expect(panel.getByRole('button', { name: /Download mix-/ })).toHaveCount(0);

    // Second run completes.
    const t0 = Date.now();
    await start.click();
    await expect(panel.getByRole('button', { name: 'Download mix-vocals.wav', exact: true })).toBeVisible({ timeout: 180_000 });
    const seconds = (Date.now() - t0) / 1000;
    console.log(`stems e2e: rerun after cancel finished in ${seconds.toFixed(1)} s for ${SECONDS} s of audio (model already in memory)`);

    const out: Record<string, Uint8Array> = {};
    for (const s of STEMS) {
      const [dl] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: `Download mix-${s}.wav`, exact: true }).click()]);
      expect(dl.suggestedFilename()).toBe(`mix-${s}.wav`);
      out[s] = new Uint8Array(readFileSync((await dl.path())!));
      const info = parseWav(out[s]!);
      expect(info.sampleRate).toBe(44100);
      expect(info.bitsPerSample).toBe(16);
      expect(info.channels).toBe(2);
      expect(Math.abs(info.durationSec - SECONDS)).toBeLessThan(0.05);
      expect(info.frames).toBe(SR * SECONDS);
      await expect(panel.locator(`[data-stem="${s}"] audio`)).toBeVisible();
    }

    const mixL = mixCh[0]!;
    const sum = new Float32Array(mixL.length);
    for (const s of STEMS) samples(out[s]!, 0).forEach((x, i) => (sum[i]! += x));
    const sumCorr = corr(sum, mixL);
    console.log(`stems e2e: corr(sum of stems, mix) = ${sumCorr.toFixed(5)}`);
    expect(sumCorr).toBeGreaterThan(0.9);
    for (let a = 0; a < STEMS.length; a++) {
      const sa = samples(out[STEMS[a]!]!, 0);
      expect(corr(sa, mixL)).toBeLessThan(0.99); // not the mix
      expect(sa.some((x) => Math.abs(x) > 0.01)).toBe(true); // not silent
      for (let b = a + 1; b < STEMS.length; b++) expect(corr(sa, samples(out[STEMS[b]!]!, 0))).toBeLessThan(0.99);
    }

    expect(foreign).toEqual([]);
    expect(modelRequests.filter((p) => p.endsWith('.onnx')).sort()).toEqual(STEMS.map((s) => `/models/spleeter-4stems/${s}.fp16.onnx`).sort());
  });
});
