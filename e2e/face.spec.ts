import { expect, test, type Page } from '@playwright/test';

// Real model, real inference (YuNet on ONNX Runtime Web, single-thread WASM) in headless Chromium.
// No photos of people are available offline, so the image is a synthetic cartoon face drawn in the page.
// What this proves is limited to that: the pipeline (download, letterbox, decode, regions, undo) works end
// to end and the model fires on a face-like drawing. It says nothing about accuracy on real photographs.
const W = 640;
const H = 480;
const MARKER = 'pkmarker-face-3c9d';
/** Ground truth: the head (skin ellipse bounding box), without hair above it. */
const FACE = { x: 230, y: 115, w: 180, h: 230 };

async function makeFace(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(
    async ({ w, h }) => {
      const c = new OffscreenCanvas(w, h);
      const g = c.getContext('2d')!;
      g.fillStyle = '#9db4c0';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#3d4a63'; // shoulders
      g.beginPath();
      g.ellipse(320, 520, 230, 170, 0, Math.PI, 2 * Math.PI);
      g.fill();
      g.fillStyle = '#d9a784'; // neck
      g.fillRect(285, 320, 70, 70);
      g.fillStyle = '#4a2f1e'; // hair behind the head
      g.beginPath();
      g.ellipse(320, 200, 102, 118, 0, 0, 2 * Math.PI);
      g.fill();
      g.fillStyle = '#e3b594'; // head
      g.beginPath();
      g.ellipse(320, 230, 90, 115, 0, 0, 2 * Math.PI);
      g.fill();
      g.fillStyle = '#4a2f1e'; // fringe
      g.beginPath();
      g.ellipse(320, 140, 92, 36, 0, Math.PI, 2 * Math.PI);
      g.fill();
      g.fillStyle = '#e3b594'; // ears
      for (const x of [228, 412]) {
        g.beginPath();
        g.ellipse(x, 235, 12, 22, 0, 0, 2 * Math.PI);
        g.fill();
      }
      for (const x of [285, 355]) {
        g.fillStyle = '#ffffff'; // eyes
        g.beginPath();
        g.ellipse(x, 215, 20, 11, 0, 0, 2 * Math.PI);
        g.fill();
        g.fillStyle = '#3b2a1c';
        g.beginPath();
        g.arc(x, 215, 8, 0, 2 * Math.PI);
        g.fill();
        g.fillStyle = '#000000';
        g.beginPath();
        g.arc(x, 215, 3.5, 0, 2 * Math.PI);
        g.fill();
        g.strokeStyle = '#3a2416'; // brows
        g.lineWidth = 6;
        g.beginPath();
        g.moveTo(x - 22, 192);
        g.lineTo(x + 22, 189);
        g.stroke();
      }
      g.strokeStyle = '#b98568'; // nose
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(320, 220);
      g.lineTo(312, 262);
      g.lineTo(328, 265);
      g.stroke();
      g.fillStyle = '#a8423f'; // mouth
      g.beginPath();
      g.ellipse(320, 300, 28, 10, 0, 0, 2 * Math.PI);
      g.fill();
      const bytes = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    },
    { w: W, h: H },
  );
  return Buffer.from(b64, 'base64');
}

type R = { x: number; y: number; w: number; h: number };
const iou = (a: R, b: R) => {
  const iw = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const ih = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (iw <= 0 || ih <= 0) return 0;
  const i = iw * ih;
  return i / (a.w * a.h + b.w * b.h - i);
};

/** Regions listed in the tool: "Region 1, solid, 120×40 at 300,200". */
async function regions(page: Page): Promise<R[]> {
  const texts = await page.getByRole('main').locator('.rd-list button').allTextContents();
  return texts.map((t) => {
    const m = /(\d+)×(\d+) at (\d+),(\d+)/.exec(t)!;
    return { x: +m[3]!, y: +m[4]!, w: +m[1]!, h: +m[2]! };
  });
}

test('redact: find faces runs the real model, adds editable regions, one undo removes them', async ({ page, context }) => {
  test.setTimeout(180_000);
  const requests: { url: string; t: number; post: Buffer | null }[] = [];
  context.on('request', (r) => requests.push({ url: r.url(), t: Date.now(), post: r.postDataBuffer() }));
  await page.goto('/tools/redact');
  const origin = new URL(page.url()).origin;

  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __seen: string[] }).__seen = seen;
    new MutationObserver(() => {
      const t = document.body.innerText;
      for (const k of ['Downloading engine', 'Processing']) if (t.includes(k) && !seen.includes(k)) seen.push(k);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });

  const png = await makeFace(page);
  await page.locator('input[type=file]').first().setInputFiles({ name: `${MARKER}.png`, mimeType: 'image/png', buffer: png });
  const main = page.getByRole('main');
  await expect(main.getByRole('application', { name: /Redaction canvas/ })).toBeVisible();
  await expect(main.getByText(/First use downloads the engine \(ONNX Runtime, [\d.]+ MB\) from this site/)).toBeVisible();
  await expect(main.getByText(/YuNet, .*MIT licence/)).toBeVisible();
  expect(await regions(page)).toEqual([]);

  const t0 = Date.now();
  await main.getByRole('button', { name: 'Find faces on this device' }).click();
  await expect(main.getByRole('status').filter({ hasText: /^(Found|No faces)/ })).toBeVisible({ timeout: 120_000 });
  const ms = Date.now() - t0;
  const found = await regions(page);
  const status = await main.getByRole('status').filter({ hasText: /^(Found|No faces)/ }).innerText();
  const best = Math.max(0, ...found.map((r) => iou(r, FACE)));
  console.log(`face: cold run ${ms} ms incl. download; ${status}; regions ${JSON.stringify(found)}; best IoU with drawn head ${best.toFixed(2)}`);

  const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen);
  expect(seen).toEqual(['Downloading engine', 'Processing']);
  const modelReq = requests.find((r) => r.url.endsWith('/models/yunet/model.onnx'));
  const wasmReq = requests.find((r) => r.url.endsWith('/engines/ort/ort-wasm-simd-threaded.wasm'));
  expect(modelReq && wasmReq).toBeTruthy();

  expect(found.length).toBeGreaterThanOrEqual(1);
  expect(best).toBeGreaterThanOrEqual(0.3);
  expect(status).toMatch(/Check the image: detection can miss faces/);
  for (const r of found) expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H).toBe(true);

  // Detected regions are ordinary regions: selectable and editable.
  await main.locator('.rd-list button').first().click();
  await expect(main.getByRole('spinbutton', { name: 'Width' })).toHaveValue(String(found[0]!.w));

  // One undo step removes the whole batch (Ctrl+Z, focus outside any field).
  await main.getByRole('heading', { name: 'Faces' }).click();
  await page.keyboard.press('Control+z');
  expect(await regions(page)).toEqual([]);
  await page.keyboard.press('Control+Shift+z');
  expect((await regions(page)).length).toBe(found.length);

  // Everything same-origin; the image and its name never appear in a URL or request body.
  const foreign = requests.filter((r) => !r.url.startsWith(origin) && !r.url.startsWith('blob:') && !r.url.startsWith('data:'));
  expect(foreign.map((r) => r.url)).toEqual([]);
  expect(requests.filter((r) => r.url.includes(MARKER) || r.post?.includes(MARKER) || r.post?.includes(png.subarray(200, 232))).length).toBe(0);
});
