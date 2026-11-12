import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeWav16 } from '../src/engines/audio/wav';
import { jpegWithMetadata } from '../src/engines/metadata/testdata';

// Network-boundary audit for on-device tools. Records every request (page, workers, service workers),
// WebSockets and workers during a real transform, then asserts: same-origin only, no marker in any URL,
// query or POST body. Then repeats the transform with the context offline.
// Output JSON goes to the session scratchpad (Playwright wipes test-results/ on each run).

const OUT = process.env.PK_AUDIT_OUT ?? '.audit/network';
const M = 'PKMARKER7731';
const MARKER_FORMS = [M, Buffer.from(M).toString('hex'), Buffer.from(M).toString('base64')];
const ONLINE = 'PKMARKER7731-secret';
const OFFLINE = 'PKMARKER7731-offline';

type Req = { phase: string; url: string; method: string; resourceType: string; post: string | null; hasFrame: boolean };
type Rec = { phase: string; reqs: Req[]; failed: { phase: string; url: string; error: string }[]; ws: string[]; workers: string[]; sw: string[] };

function record(context: BrowserContext, page: Page): Rec {
  const rec: Rec = { phase: 'online', reqs: [], failed: [], ws: [], workers: [], sw: [] };
  context.on('request', (r: Request) => {
    let post: string | null = null;
    try { post = r.postData(); } catch { post = '<binary>'; }
    rec.reqs.push({ phase: rec.phase, url: r.url(), method: r.method(), resourceType: r.resourceType(), post, hasFrame: (() => { try { return r.frame() !== null; } catch { return false; } })() });
  });
  context.on('requestfailed', (r: Request) => {
    rec.failed.push({ phase: rec.phase, url: r.url(), error: r.failure()?.errorText ?? 'unknown' });
  });
  page.on('websocket', (ws) => rec.ws.push(ws.url()));
  page.on('worker', (w) => rec.workers.push(w.url()));
  context.on('serviceworker', (sw) => rec.sw.push(sw.url()));
  return rec;
}

function variants(url: string): string[] {
  const out = [url];
  try { out.push(decodeURIComponent(url)); } catch { /* malformed escape: raw form only */ }
  return out;
}

function audit(rec: Rec, appOrigin: string) {
  const appHost = new URL(appOrigin).host;
  const external: string[] = [];
  const markerHits: string[] = [];
  const byOrigin: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let dataUrls = 0;
  for (const r of rec.reqs) {
    byType[r.resourceType] = (byType[r.resourceType] ?? 0) + 1;
    const u = new URL(r.url);
    byOrigin[u.protocol === 'data:' || u.protocol === 'blob:' ? u.protocol : u.origin] = (byOrigin[u.protocol === 'data:' || u.protocol === 'blob:' ? u.protocol : u.origin] ?? 0) + 1;
    if (u.protocol === 'data:') dataUrls++;
    else if (u.protocol === 'blob:') { if (new URL(r.url.slice(5)).origin !== appOrigin) external.push(r.url); }
    else if (u.origin !== appOrigin) external.push(`${r.method} ${r.url} [${r.resourceType}]`);
    for (const v of variants(r.url)) for (const m of MARKER_FORMS) if (v.includes(m)) markerHits.push(`URL(${r.phase}) ${r.url}`);
    if (r.post) for (const m of MARKER_FORMS) if (r.post.includes(m)) markerHits.push(`POST(${r.phase}) ${r.url}`);
  }
  const wsBad = rec.ws.filter((w) => new URL(w).host !== appHost);
  const wsDev = rec.ws.filter((w) => new URL(w).host === appHost);
  for (const w of rec.workers) if (new URL(w).origin !== appOrigin) external.push(`worker ${w}`);
  for (const w of rec.ws) for (const m of MARKER_FORMS) if (w.includes(m)) markerHits.push(`WS ${w}`);
  for (const w of rec.workers) for (const m of MARKER_FORMS) if (w.includes(m)) markerHits.push(`WORKER ${w}`);
  const noFrame = rec.reqs.filter((r) => !r.hasFrame).length;
  return { requests: rec.reqs.length, byOrigin, byType, dataUrls, noFrameRequests: noFrame, external, wsBad, wsDev, workers: rec.workers, sw: rec.sw, markerHits, failed: rec.failed };
}

const appOrigin = (): string => new URL(test.info().project.use.baseURL ?? 'http://localhost:4173').origin;

/** Waits for the page's own tool area; avoids counting an un-hydrated shell as "loaded". */
async function settle(page: Page) {
  await expect(page.getByRole('main')).toBeVisible();
  await page.waitForLoadState('load');
}

function upload(page: Page, name: string, mimeType: string, buffer: Buffer) {
  return page.locator('input[type=file]').first().setInputFiles({ name, mimeType, buffer });
}

// ----- fixtures, generated in node. Filenames and text carry the marker.
let fx: { png: Buffer; portrait: Buffer; jpgMeta: Buffer; pdf: Buffer; csv: string; srt: string; wav: Buffer };

test.beforeAll(async () => {
  const png = new PNG({ width: 400, height: 300 });
  for (let y = 0; y < 300; y++) for (let x = 0; x < 400; x++) {
    const i = (y * 400 + x) * 4;
    png.data[i] = x % 256; png.data[i + 1] = y % 256; png.data[i + 2] = 160; png.data[i + 3] = 255;
  }
  const portrait = new PNG({ width: 600, height: 800 });
  for (let i = 0; i < portrait.data.length; i += 4) { portrait.data[i] = 60; portrait.data[i + 1] = 100; portrait.data[i + 2] = 150; portrait.data[i + 3] = 255; }
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const label of [`${M} page 1`, `${M} page 2`]) {
    const p = doc.addPage([300, 300]);
    p.drawText(label, { x: 20, y: 150, size: 18, font });
  }
  const sr = 48000;
  const samples = Float32Array.from({ length: sr }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr));
  fx = {
    png: PNG.sync.write(png),
    portrait: PNG.sync.write(portrait),
    jpgMeta: Buffer.from(jpegWithMetadata({ gps: true, xmp: true })),
    pdf: Buffer.from(await doc.save()),
    csv: `id,name,note\n1,Ann,${M}\n2,Bo,"hello, world"\n`,
    srt: `1\n00:00:01,000 --> 00:00:02,000\n${M}\n\n2\n00:00:03,000 --> 00:00:04,500\nSecond\n`,
    wav: Buffer.from(encodeWav16([samples], sr)),
  };
  mkdirSync(OUT, { recursive: true });
});

type Flow = { id: string; route: string; run: (page: Page, base: string) => Promise<void> };

/** Bounds one transform so a stuck step fails the test instead of hanging the run. */
function bounded(p: Promise<void>, ms: number): Promise<void> {
  let t: NodeJS.Timeout | undefined;
  return Promise.race([
    p,
    new Promise<void>((_, rej) => { t = setTimeout(() => rej(new Error(`transform exceeded ${ms} ms`)), ms); }),
  ]).finally(() => clearTimeout(t));
}

const flows: Flow[] = [
  {
    id: 'compress', route: '/tools/compress',
    run: async (page, b) => {
      await upload(page, `${b}.png`, 'image/png', fx.png);
      await page.getByRole('button', { name: 'Compress', exact: true }).click();
      await expect(page.getByRole('button', { name: new RegExp(`^Download ${b}-compressed`) }).first()).toBeVisible({ timeout: 60_000 });
    },
  },
  {
    id: 'convert', route: '/tools/convert',
    run: async (page, b) => {
      await upload(page, `${b}.png`, 'image/png', fx.png);
      await page.getByRole('combobox', { name: 'Output format' }).selectOption('image/jpeg');
      await page.getByRole('button', { name: 'Convert', exact: true }).click();
      await expect(page.getByRole('button', { name: new RegExp(`^Download ${b}-converted`) }).first()).toBeVisible({ timeout: 60_000 });
    },
  },
  {
    id: 'metadata', route: '/tools/metadata',
    run: async (page, b) => {
      await upload(page, `${b}.jpg`, 'image/jpeg', fx.jpgMeta);
      await expect(page.getByText('This photo contains a location.').first()).toBeVisible({ timeout: 30_000 });
      await page.getByRole('checkbox', { name: /Keep rotation/ }).uncheck();
      await page.getByRole('button', { name: 'Remove metadata', exact: true }).click();
      await expect(page.getByRole('button', { name: `Download ${b}-clean.jpg`, exact: true }).first()).toBeVisible({ timeout: 60_000 });
    },
  },
  {
    id: 'redact', route: '/tools/redact',
    run: async (page, b) => {
      await upload(page, `${b}.png`, 'image/png', fx.png);
      const main = page.getByRole('main');
      await expect(main.getByRole('application', { name: new RegExp(`Redaction canvas for ${b}`) })).toBeVisible({ timeout: 30_000 });
      await main.getByRole('button', { name: 'Add region', exact: true }).click();
      await main.getByRole('spinbutton', { name: 'Width' }).fill('60');
      await main.getByRole('spinbutton', { name: 'Height' }).fill('40');
      await main.getByRole('spinbutton', { name: 'X' }).fill('20');
      await main.getByRole('spinbutton', { name: 'Y' }).fill('20');
      await main.getByRole('radio', { name: 'Solid', exact: true }).click();
      const before = await main.getByRole('button', { name: 'Download result', exact: true }).count();
      await main.getByRole('button', { name: 'Export redacted image', exact: true }).click();
      await expect(main.getByRole('button', { name: 'Download result', exact: true })).toHaveCount(before + 1, { timeout: 60_000 });
    },
  },
  {
    id: 'pdf', route: '/tools/pdf',
    run: async (page, b) => {
      await upload(page, `${b}.pdf`, 'application/pdf', fx.pdf);
      const main = page.getByRole('main');
      await expect(main.getByRole('list', { name: 'Pages' }).getByRole('listitem')).toHaveCount(2, { timeout: 30_000 });
      await page.getByRole('complementary', { name: 'PDF settings' }).getByRole('button', { name: 'Export PDF' }).click();
      await expect(main.getByRole('button', { name: `Download ${b}-edited.pdf`, exact: true }).first()).toBeVisible({ timeout: 60_000 });
    },
  },
  {
    id: 'csv', route: '/tools/csv',
    run: async (page, b) => {
      await upload(page, `${b}.csv`, 'text/csv', Buffer.from(fx.csv, 'utf8'));
      const main = page.getByRole('main');
      await expect(main.getByText(M, { exact: false }).first()).toBeVisible({ timeout: 30_000 });
      await main.getByRole('button', { name: 'Export CSV', exact: true }).click();
      await expect(main.getByRole('button', { name: `Download ${b}-cleaned.csv`, exact: true }).first()).toBeVisible({ timeout: 60_000 });
    },
  },
  {
    id: 'qr-code', route: '/tools/qr-code',
    run: async (page, b) => {
      const main = page.getByRole('main');
      await main.getByLabel('Text or URL', { exact: true }).fill(b);
      await expect(main.getByText('Checked: decodes to the same content.')).toBeVisible({ timeout: 30_000 });
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), main.getByRole('button', { name: 'Download PNG' }).click()]);
      await dl.path();
    },
  },
  {
    id: 'clean-links', route: '/tools/clean-links',
    run: async (page, b) => {
      const main = page.getByRole('main');
      await main.getByLabel('URLs, one per line', { exact: true }).fill(`https://ex.com/${b}?utm_source=${b}&id=7`);
      await expect(main.getByText(`https://ex.com/${b}?id=7`, { exact: true })).toBeVisible({ timeout: 30_000 });
    },
  },
  {
    id: 'clean-text', route: '/tools/clean-text',
    run: async (page, b) => {
      const main = page.getByRole('main');
      await main.getByLabel('Text to check', { exact: true }).fill(`${b}​ tail`);
      await expect(main.getByLabel('Output', { exact: true })).toHaveValue(`${b} tail`, { timeout: 30_000 });
    },
  },
  {
    id: 'dev-hash', route: '/tools/dev-tools?u=hash',
    run: async (page, b) => {
      await page.getByLabel('Text', { exact: true }).fill(b);
      await expect(page.getByText('SHA-256', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    },
  },
  {
    id: 'dev-base64', route: '/tools/dev-tools?u=base64',
    run: async (page, b) => {
      await page.getByLabel('Text to encode', { exact: true }).fill(b);
      const b64 = Buffer.from(b).toString('base64');
      await expect(page.getByText(b64, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    },
  },
  {
    id: 'subtitles', route: '/tools/subtitles',
    run: async (page, b) => {
      await upload(page, `${b}.srt`, 'application/x-subrip', Buffer.from(fx.srt, 'utf8'));
      await expect(page.getByLabel('Start of cue 1')).toBeVisible({ timeout: 30_000 });
      const settings = page.getByRole('complementary', { name: 'Subtitles settings' });
      await settings.getByRole('radio', { name: 'WebVTT' }).click();
      await settings.getByRole('button', { name: 'Export subtitles' }).click();
      await expect(settings.getByRole('button', { name: `Download ${b}-edited.vtt`, exact: true })).toBeVisible({ timeout: 60_000 });
    },
  },
  {
    id: 'id-photo', route: '/tools/id-photo',
    run: async (page, b) => {
      await upload(page, `${b}.png`, 'image/png', fx.portrait);
      const main = page.getByRole('main');
      await page.getByRole('combobox', { name: 'Document preset' }).selectOption('uk-passport');
      await main.getByRole('button', { name: 'Export photo', exact: true }).click();
      await expect(main.getByRole('button', { name: `Download ${b}-id.jpg`, exact: true })).toBeVisible({ timeout: 60_000 });
    },
  },
  {
    id: 'audio-stems', route: '/tools/audio-stems',
    run: async (page, b) => {
      await upload(page, `${b}.wav`, 'audio/wav', fx.wav);
      const main = page.getByRole('main');
      await page.getByRole('combobox', { name: 'Sample rate' }).selectOption('44100');
      await main.getByRole('button', { name: 'Extract audio (WAV)', exact: true }).click();
      await expect(main.getByRole('button', { name: `Download ${b}-audio.wav`, exact: true })).toBeVisible({ timeout: 60_000 });
    },
  },
];

function save(flow: string, mode: string, rec: Rec, result: unknown) {
  writeFileSync(join(OUT, `${flow}-${mode}.json`), JSON.stringify({ flow, mode, result, rec }, null, 2));
}

for (const f of flows) {
  test.describe(f.id, () => {
    test.setTimeout(240_000);

    test(`${f.id}: every request during load + transform is same-origin and marker-free; warm offline rerun`, async ({ page, context }) => {
      const rec = record(context, page);
      await page.goto(f.route);
      await settle(page);
      await bounded(f.run(page, ONLINE), 120_000); // online transform must succeed, or the test fails here
      // Offline behaviour is covered by e2e/offline.spec.ts against the production build (service worker).
      // Set PK_NET_OFFLINE=1 to also try a warm offline rerun here.
      let completed = true;
      let err = '';
      if (process.env.PK_NET_OFFLINE) {
        rec.phase = 'offline-warm';
        await context.setOffline(true);
        try { await bounded(f.run(page, OFFLINE), 90_000); } catch (e) { completed = false; err = String(e).split('\n')[0] ?? ''; }
        await context.setOffline(false);
      }
      const a = audit(rec, appOrigin());
      console.log(`NET|${f.id}|warm|reqs=${a.requests}|external=${a.external.length}|ws=${rec.ws.length}(dev ${a.wsDev.length}, bad ${a.wsBad.length})|workers=${a.workers.length}|sw=${a.sw.length}|markerHits=${a.markerHits.length}|offlineCompleted=${completed}`);
      for (const x of a.external) console.log(`NET-EXTERNAL|${f.id}|${x}`);
      save(f.id, 'warm', rec, { ...a, offlineCompleted: completed, offlineError: err });
      expect.soft(a.external, 'non-same-origin requests').toEqual([]);
      expect.soft(a.wsBad, 'WebSockets other than same-origin dev HMR').toEqual([]);
      expect(a.markerHits, 'marker in URL, query or POST body').toEqual([]);
      // A same-origin service worker exists in the production build; its requests are recorded like any other.
      expect.soft(completed, `offline rerun completed: ${err}`).toBe(true);
    });

    test(`${f.id}: lazy offline, transform is the first action after load with network off`, async ({ page, context }) => {
      test.skip(!process.env.PK_NET_OFFLINE, 'offline is verified in offline.spec.ts on the production build');
      const rec = record(context, page);
      await page.goto(f.route);
      await settle(page);
      rec.phase = 'lazy-offline';
      await context.setOffline(true);
      let completed = true;
      let err = '';
      try { await bounded(f.run(page, OFFLINE), 90_000); } catch (e) { completed = false; err = String(e).split('\n')[0] ?? ''; }
      await context.setOffline(false);
      const a = audit(rec, appOrigin());
      console.log(`NET|${f.id}|lazy-offline|reqs=${a.requests}|external=${a.external.length}|markerHits=${a.markerHits.length}|completed=${completed}`);
      save(f.id, 'lazy-offline', rec, { ...a, completed, error: err });
      expect.soft(a.external, 'non-same-origin requests').toEqual([]);
      expect(a.markerHits, 'marker in URL, query or POST body').toEqual([]);
      expect.soft(completed, `lazy offline transform: ${err}`).toBe(true);
    });
  });
}
