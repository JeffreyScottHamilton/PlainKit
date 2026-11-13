import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

// Real model, real inference (U²-Net-p on ONNX Runtime Web, single-thread WASM) in headless Chromium.
const W = 640;
const H = 480;
const MARKER = 'pkmarker-cutout-7f3a';

/**
 * Synthetic test images drawn in the page. 'person': a flat head-and-shoulders silhouette with
 * skin, hair and shirt tones on a plain blue backdrop (a cartoon, not a photo). 'object': a red mug
 * with a handle on an off-white backdrop. Subjects are clearly separated from the background.
 */
async function makeImage(page: Page, kind: 'person' | 'object'): Promise<Buffer> {
  const b64 = await page.evaluate(
    async ({ kind, w, h }) => {
      const c = new OffscreenCanvas(w, h);
      const g = c.getContext('2d')!;
      if (kind === 'person') {
        g.fillStyle = '#3a73bf';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#59544c';
        g.beginPath();
        g.ellipse(320, 480, 190, 190, 0, Math.PI, 2 * Math.PI);
        g.fill();
        g.fillStyle = '#ddad8f';
        g.fillRect(288, 240, 64, 60);
        g.beginPath();
        g.ellipse(320, 170, 70, 90, 0, 0, 2 * Math.PI);
        g.fill();
        g.fillStyle = '#40291a';
        g.beginPath();
        g.ellipse(320, 140, 76, 60, 0, Math.PI, 2 * Math.PI);
        g.fill();
        g.fillStyle = '#261f1a';
        for (const x of [295, 345]) {
          g.beginPath();
          g.ellipse(x, 165, 9, 5, 0, 0, 2 * Math.PI);
          g.fill();
        }
        g.fillStyle = '#a64d4d';
        g.fillRect(298, 212, 44, 6);
      } else {
        g.fillStyle = '#ebebe6';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#cc261f';
        g.fillRect(240, 150, 160, 210);
        g.lineWidth = 20;
        g.strokeStyle = '#cc261f';
        g.beginPath();
        g.ellipse(405, 250, 35, 45, 0, -Math.PI / 2, Math.PI / 2);
        g.stroke();
      }
      const bytes = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    },
    { kind, w: W, h: H },
  );
  return Buffer.from(b64, 'base64');
}

type Stats = { lo: number; hi: number; corners: number; centre: number };
/** Fractions: alpha<10 and alpha>245 overall, transparent (<10) in four 48px corner squares, opaque (>245) in a subject box. */
function alphaStats(png: PNG, box: { x: number; y: number; w: number; h: number }): Stats {
  const a = (x: number, y: number) => png.data[(y * png.width + x) * 4 + 3]!;
  let lo = 0;
  let hi = 0;
  for (let y = 0; y < png.height; y++)
    for (let x = 0; x < png.width; x++) {
      if (a(x, y) < 10) lo++;
      if (a(x, y) > 245) hi++;
    }
  let ct = 0;
  let cn = 0;
  for (const [x0, y0] of [[0, 0], [png.width - 48, 0], [0, png.height - 48], [png.width - 48, png.height - 48]] as const)
    for (let y = y0; y < y0 + 48; y++)
      for (let x = x0; x < x0 + 48; x++) {
        cn++;
        if (a(x, y) < 10) ct++;
      }
  let st = 0;
  let sn = 0;
  for (let y = box.y; y < box.y + box.h; y++)
    for (let x = box.x; x < box.x + box.w; x++) {
      sn++;
      if (a(x, y) > 245) st++;
    }
  const n = png.width * png.height;
  return { lo: lo / n, hi: hi / n, corners: ct / cn, centre: st / sn };
}

async function upload(page: Page, name: string, buffer: Buffer) {
  await page.locator('input[type=file]').first().setInputFiles({ name, mimeType: 'image/png', buffer });
  await expect(page.getByRole('img', { name: `Original: ${name}` }).first()).toBeVisible();
}

async function runAndDownload(page: Page, button: string): Promise<{ png: PNG; ms: number; bytes: Buffer }> {
  const t0 = Date.now();
  await page.getByRole('button', { name: button, exact: true }).click();
  const dlButton = page.getByRole('button', { name: 'Download PNG', exact: true });
  await expect(dlButton).toBeVisible({ timeout: 150_000 });
  const ms = Date.now() - t0;
  const [dl] = await Promise.all([page.waitForEvent('download'), dlButton.click()]);
  const bytes = readFileSync((await dl.path())!);
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return { png: PNG.sync.read(bytes), ms, bytes };
}

test('cutout: real model download, local inference, offline rerun, cancel', async ({ page, context }) => {
  test.setTimeout(420_000);
  const requests: { url: string; post: Buffer | null }[] = [];
  context.on('request', (r) => requests.push({ url: r.url(), post: r.postDataBuffer() }));
  await page.goto('/tools/cutout');
  const origin = new URL(page.url()).origin;

  // Record the stage sequence shown by the tool (download can be too quick to poll for).
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __stages: string[] }).__stages = seen;
    new MutationObserver(() => {
      const s = document.querySelector('[data-cutout-stage]')?.getAttribute('data-cutout-stage');
      if (s && seen[seen.length - 1] !== s) seen.push(s);
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-cutout-stage'] });
  });

  const person = await makeImage(page, 'person');
  await upload(page, `${MARKER}-person.png`, person);
  await expect(page.getByText(/First use downloads .* from this site/)).toBeVisible();

  // 1) cold: download model + engine, then inference.
  const r1 = await runAndDownload(page, 'Download model and remove background');
  // The original must not show underneath the result (it once did, so the background looked untouched).
  expect(await page.getByRole('img', { name: `Original: ${MARKER}-person.png` }).first().evaluate((el) => getComputedStyle(el).clipPath)).toContain('100%');
  const stages = await page.evaluate(() => (window as unknown as { __stages: string[] }).__stages);
  expect(stages.indexOf('loading-engine')).toBeGreaterThanOrEqual(0);
  expect(stages.indexOf('loading-engine')).toBeLessThan(stages.indexOf('processing'));
  expect([r1.png.width, r1.png.height]).toEqual([W, H]);
  const s1 = alphaStats(r1.png, { x: 290, y: 150, w: 60, h: 60 }); // face
  const torso = alphaStats(r1.png, { x: 220, y: 380, w: 200, h: 80 }).centre;
  console.log(`cutout person: cold run ${r1.ms} ms (download + inference), stages ${stages.join(' > ')}, stats ${JSON.stringify(s1)}, torso opaque ${torso.toFixed(3)}`);
  expect(s1.lo).toBeGreaterThan(0.05);
  expect(s1.hi).toBeGreaterThan(0.05);
  expect(s1.corners).toBeGreaterThan(0.9);
  expect(s1.centre).toBeGreaterThan(0.9);
  await expect(page.getByText(/Last run: \d+(\.\d)? s on this device/)).toBeVisible();

  // 2) offline: a second image works with the model already in memory (no remote inference possible).
  await context.setOffline(true);
  const object = await makeImage(page, 'object');
  await upload(page, `${MARKER}-object.png`, object);
  const r2 = await runAndDownload(page, 'Remove background');
  expect([r2.png.width, r2.png.height]).toEqual([W, H]);
  const s2 = alphaStats(r2.png, { x: 270, y: 190, w: 100, h: 130 }); // mug body
  console.log(`cutout object (offline): ${r2.ms} ms, stats ${JSON.stringify(s2)}`);
  expect(s2.lo).toBeGreaterThan(0.05);
  expect(s2.hi).toBeGreaterThan(0.05);
  expect(s2.corners).toBeGreaterThan(0.9);
  expect(s2.centre).toBeGreaterThan(0.9);
  await context.setOffline(false);

  // 3) cancel during inference leaves the tool usable.
  await upload(page, `${MARKER}-again.png`, person);
  await page.getByRole('button', { name: 'Remove background', exact: true }).click();
  await expect(page.getByText('Removing background', { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('Canceled. Your original file is unchanged.')).toBeVisible();
  const r3 = await runAndDownload(page, 'Remove background');
  expect([r3.png.width, r3.png.height]).toEqual([W, H]);
  console.log(`cutout after cancel: ${r3.ms} ms (worker re-initialised from in-memory model)`);

  // Network audit: everything same-origin, no user content in any URL or body.
  const foreign = requests.filter((r) => !r.url.startsWith(origin) && !r.url.startsWith('blob:') && !r.url.startsWith('data:'));
  expect(foreign.map((r) => r.url)).toEqual([]);
  expect(requests.filter((r) => r.url.includes(MARKER)).map((r) => r.url)).toEqual([]);
  const probe = person.subarray(200, 232);
  expect(requests.filter((r) => r.post && (r.post.includes(MARKER) || r.post.includes(probe))).length).toBe(0);
  const modelFetches = requests.filter((r) => r.url.endsWith('/models/u2netp/model.onnx')).length;
  console.log(`cutout network: ${requests.length} requests, all same-origin; model GETs/HEADs ${modelFetches}`);
});
