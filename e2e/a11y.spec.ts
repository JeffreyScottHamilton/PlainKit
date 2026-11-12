import { expect, test, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

// Audit spec: axe per route and theme, reflow, keyboard, target size, reduced motion, token contrast.
// Results are written as JSON under test-results/a11y/ (gitignored output dir) and echoed as A11Y lines.

// Output goes to the session scratchpad (Playwright wipes test-results/ on each run).
const OUT = process.env.PK_AUDIT_OUT ?? '.audit/a11y';

const TOOL_IDS = ['compress', 'convert', 'cutout', 'dev-tools', 'metadata', 'clean-links', 'send-files', 'redact', 'pdf',
  'audio-stems', 'subtitles', 'qr-code', 'csv', 'id-photo', 'clean-text', 'video', 'keep-awake'];
const NAMES = ['Compress', 'Convert', 'Cutout', 'Dev tools', 'Metadata', 'Clean links', 'Send files', 'Redact', 'PDF',
  'Audio stems', 'Subtitles', 'QR code', 'CSV', 'ID photo', 'Clean text', 'Video', 'Keep awake'];
const ROUTES = ['/', '/settings', ...TOOL_IDS.map((id) => `/tools/${id}`)];
const THEMES = ['dark', 'light'] as const;
type Theme = (typeof THEMES)[number];
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

type Finding = { route: string; theme: Theme; state: string; rule: string; impact: string | null | undefined; nodes: number; selector: string; help: string };

/** Sets the stored theme before the app boots, so the first paint uses it. */
async function setTheme(page: Page, theme: Theme) {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('plainkit:prefs', JSON.stringify({ theme: t, favorites: [], recents: [] }));
    } catch {
      /* storage blocked */
    }
  }, theme);
}

async function settle(page: Page) {
  await expect(page.locator('main')).toBeVisible();
  await page.waitForLoadState('load');
  await page.waitForTimeout(250);
}

async function runAxe(page: Page, route: string, theme: Theme, state: string): Promise<Finding[]> {
  const res = await new AxeBuilder({ page: page as never }).withTags(WCAG_TAGS).analyze();
  return res.violations.map((v) => ({
    route, theme, state, rule: v.id, impact: v.impact, nodes: v.nodes.length,
    selector: v.nodes[0]?.target.join(' ') ?? '', help: v.help,
  }));
}

function report(name: string, testInfo: TestInfo, findings: unknown) {
  mkdirSync(OUT, { recursive: true });
  const body = JSON.stringify(findings, null, 2);
  writeFileSync(join(OUT, `${name}.json`), body);
  testInfo.attach(name, { body, contentType: 'application/json' });
}

const isSerious = (f: Finding) => f.impact === 'serious' || f.impact === 'critical';

// ---------- 1. axe on every route, both themes (one test per route+theme so failures do not hide the rest)
test.describe('axe: every route, both themes', () => {
  for (const theme of THEMES) {
    for (const route of ROUTES) {
      test(`axe ${route} ${theme}`, async ({ page }, testInfo) => {
        await setTheme(page, theme);
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto(route);
        await settle(page);
        const findings = await runAxe(page, route, theme, 'initial');
        for (const f of findings) console.log(`A11Y|${f.route}|${f.theme}|${f.state}|${f.rule}|${f.impact}|${f.nodes}|${f.selector}`);
        report(`axe-${theme}-${route.replace(/\//g, '_') || 'root'}`, testInfo, findings);
        const serious = findings.filter(isSerious);
        expect.soft(serious.map((f) => `${f.rule}(${f.impact}) x${f.nodes} @ ${f.selector}`), `${route} ${theme}`).toEqual([]);
      });
    }
  }
});

// ---------- 2. loaded states
test.describe('axe: loaded states', () => {
  for (const theme of THEMES) {
    test(`compress with a generated image ${theme}`, async ({ page }, testInfo) => {
      await setTheme(page, theme);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/tools/compress');
      await settle(page);
      const png = PNG.sync.write(new PNG({ width: 64, height: 48 }));
      await page.locator('input[type=file]').first().setInputFiles({ name: 'a11y.png', mimeType: 'image/png', buffer: png });
      await expect(page.getByRole('button', { name: 'Preview a11y.png', exact: true })).toBeVisible();
      const findings = await runAxe(page, '/tools/compress', theme, 'image loaded');
      for (const f of findings) console.log(`A11Y|${f.route}|${f.theme}|${f.state}|${f.rule}|${f.impact}|${f.nodes}|${f.selector}`);
      report(`axe-loaded-compress-${theme}`, testInfo, findings);
      expect.soft(findings.filter(isSerious).map((f) => `${f.rule} x${f.nodes} @ ${f.selector}`)).toEqual([]);
    });

    test(`dev-tools json after Load example ${theme}`, async ({ page }, testInfo) => {
      await setTheme(page, theme);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/tools/dev-tools?u=json');
      await settle(page);
      await page.getByRole('button', { name: 'Load example', exact: true }).first().click();
      await page.waitForTimeout(300);
      const findings = await runAxe(page, '/tools/dev-tools?u=json', theme, 'example loaded');
      for (const f of findings) console.log(`A11Y|${f.route}|${f.theme}|${f.state}|${f.rule}|${f.impact}|${f.nodes}|${f.selector}`);
      report(`axe-loaded-json-${theme}`, testInfo, findings);
      expect.soft(findings.filter(isSerious).map((f) => `${f.rule} x${f.nodes} @ ${f.selector}`)).toEqual([]);
    });
  }
});

// ---------- 3. reflow at 320x640
test('reflow: no horizontal page scroll at 320x640 on every route', async ({ page }, testInfo) => {
  await setTheme(page, 'dark');
  await page.setViewportSize({ width: 320, height: 640 });
  const rows: { route: string; scrollWidth: number; innerWidth: number; offenders: string[] }[] = [];
  for (const route of ROUTES) {
    await page.goto(route);
    await settle(page);
    const row = await page.evaluate(() => {
      const iw = window.innerWidth;
      const sw = document.documentElement.scrollWidth;
      const offenders: string[] = [];
      for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > iw + 0.5 && offenders.length < 6) {
          const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).join('.') : '';
          offenders.push(`${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} right=${Math.round(r.right)}`);
        }
      }
      return { scrollWidth: sw, innerWidth: iw, offenders };
    });
    rows.push({ route, ...row });
    console.log(`REFLOW|${route}|scrollWidth=${row.scrollWidth}|innerWidth=${row.innerWidth}|${row.offenders.join(' ; ')}`);
    expect.soft(row.scrollWidth <= row.innerWidth, `${route}: scrollWidth ${row.scrollWidth} > ${row.innerWidth}`).toBe(true);
  }
  report('reflow-320x640', testInfo, rows);
});

// ---------- 4. keyboard
test('keyboard: first Tab on / reaches Skip to content, and it moves focus to main', async ({ page }) => {
  await setTheme(page, 'dark');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await settle(page);
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => ({ text: document.activeElement?.textContent?.trim(), href: document.activeElement?.getAttribute('href') }));
  expect(first).toEqual({ text: 'Skip to content', href: '#main' });
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('main');
});

test('keyboard: all 17 sidebar links reachable by Tab at 1280px, in registry order', async ({ page }, testInfo) => {
  await setTheme(page, 'dark');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await settle(page);
  const seen: string[] = [];
  for (let i = 0; i < 150 && seen.length < 17; i++) {
    await page.keyboard.press('Tab');
    const name = await page.evaluate(() => {
      const a = document.activeElement;
      return a instanceof HTMLAnchorElement && a.closest('nav[aria-label="Tools"]') ? a.textContent?.trim() ?? null : null;
    });
    if (name && !seen.includes(name)) seen.push(name);
  }
  report('keyboard-sidebar-tab-order', testInfo, { seen });
  expect.soft(seen).toEqual(NAMES);
});

test('keyboard: 390px drawer opens from hamburger, focus moves in, Tab stays inside, Escape returns focus', async ({ page }) => {
  await setTheme(page, 'dark');
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  await settle(page);
  const opener = page.getByRole('button', { name: 'Open tools menu' });
  await opener.focus();
  await page.keyboard.press('Enter');
  const drawer = page.locator('#tools-drawer');
  await expect(drawer).toBeVisible();
  const inside = () => page.evaluate(() => !!document.activeElement?.closest('#tools-drawer'));
  expect.soft(await inside(), 'focus moved into drawer on open').toBe(true);
  for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
  expect.soft(await inside(), 'focus contained after 40 Tabs').toBe(true);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(opener).toBeFocused();
});

// ---------- 5. target size at 390px
const TARGET_JS = (containers: string[]) => {
  const out: { where: string; desc: string; w: number; h: number }[] = [];
  let measured = 0;
  for (const c of containers) {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(`${c} button, ${c} a[href], ${c} input, ${c} select, ${c} textarea, ${c} [role="button"]`))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      measured++;
      if (r.width < 24 || r.height < 24) {
        out.push({
          where: c,
          desc: `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : ''}${el.getAttribute('aria-label') ? `[aria-label="${el.getAttribute('aria-label')}"]` : ''} "${(el.textContent ?? '').trim().slice(0, 30)}"`,
          w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
        });
      }
    }
  }
  return { measured, small: out };
};

test('target size at 390px: shell controls (top bar, tray, drawer) at least 24x24 CSS px', async ({ page }, testInfo) => {
  await setTheme(page, 'dark');
  await page.setViewportSize({ width: 390, height: 800 });
  const small: unknown[] = [];
  for (const route of ['/', '/tools/compress']) {
    await page.goto(route);
    await settle(page);
    const closed = await page.evaluate(TARGET_JS, ['.topbar', '.tray']);
    console.log(`TARGET-MEASURED|${route}|closed|${closed.measured}`);
    small.push(...closed.small.map((x) => ({ route, state: 'closed', ...x })));
    await page.getByRole('button', { name: 'Open tools menu' }).click();
    await expect(page.locator('#tools-drawer')).toBeVisible();
    const drawer = await page.evaluate(TARGET_JS, ['#tools-drawer']);
    console.log(`TARGET-MEASURED|${route}|drawer|${drawer.measured}`);
    small.push(...drawer.small.map((x) => ({ route, state: 'drawer open', ...x })));
    await page.keyboard.press('Escape');
  }
  for (const s of small) console.log(`TARGET|${JSON.stringify(s)}`);
  expect(small.length).toBeGreaterThanOrEqual(0);
  report('target-size-390', testInfo, small);
  expect.soft(small, 'controls under 24x24').toEqual([]);
});

// ---------- 6. reduced motion
test('reduced motion: no animation or transition above 0.02s on / and /tools/compress', async ({ page }, testInfo) => {
  await setTheme(page, 'dark');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 800 });
  const offenders: unknown[] = [];
  for (const route of ['/', '/tools/compress']) {
    await page.goto(route);
    await settle(page);
    const found = await page.evaluate(() => {
      const toSec = (v: string) => v.split(',').map((p) => {
        const n = parseFloat(p);
        return /ms$/.test(p.trim()) ? n / 1000 : n;
      });
      const res: { sel: string; prop: string; value: string }[] = [];
      for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
        const cs = getComputedStyle(el);
        for (const prop of ['animationDuration', 'transitionDuration'] as const) {
          if (Math.max(...toSec(cs[prop])) > 0.02) {
            res.push({ sel: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : ''), prop, value: cs[prop] });
          }
        }
      }
      return res.slice(0, 20);
    });
    for (const f of found) offenders.push({ route, ...f });
  }
  report('reduced-motion', testInfo, offenders);
  expect.soft(offenders, 'elements over 0.02s').toEqual([]);
});

// ---------- 7. contrast from computed styles
test.describe('contrast of tokens and states', () => {
  for (const theme of THEMES) {
    test(`contrast ${theme}`, async ({ page }, testInfo) => {
      await setTheme(page, theme);
      await page.setViewportSize({ width: 1280, height: 800 });
      const rows: { pair: string; fg: string; bg: string; ratio: number | null; need: number; pass: boolean | null; note?: string }[] = [];

      // Helpers run in the page: composite translucent backgrounds over the ancestor stack.
      const helpers = `
        const parse = (c) => { const m = c && c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null;
          const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
        const effBg = (el) => { const layers = []; let e = el;
          while (e) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } e = e.parentElement; }
          let out = { r: 255, g: 255, b: 255, a: 1 };
          const opaque = layers.length && layers[layers.length - 1].a >= 1;
          if (!opaque) out = { r: 255, g: 255, b: 255, a: 1 };
          for (let i = layers.length - 1; i >= 0; i--) { const L = layers[i]; const a = L.a; out = { r: L.r * a + out.r * (1 - a), g: L.g * a + out.g * (1 - a), b: L.b * a + out.b * (1 - a), a: 1 }; }
          return { ...out, opaque }; };
        const fgOf = (el) => { const c = parse(getComputedStyle(el).color); return c; };
        const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
        const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
        const show = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
      `;
      type Probe = { pair: string; fgSel: string; bgEl: string; need: number; mode?: 'border' | 'outline' | 'border-vs-parent'; fgExtra?: string };
      const probes: Probe[] = [
        { pair: 'body text on canvas', fgSel: 'body', bgEl: 'body', need: 4.5 },
        { pair: 'secondary (.muted) on canvas (Settings)', fgSel: 'main .muted', bgEl: 'main .muted', need: 4.5 },
        { pair: 'secondary (.tray__count) on panel', fgSel: '.tray__count', bgEl: '.tray__count', need: 4.5 },
        { pair: 'sidebar link text on sidebar', fgSel: '.side__link:not(.is-active)', bgEl: '.side__link:not(.is-active)', need: 4.5 },
        { pair: 'active sidebar link on its background', fgSel: '.side__link.is-active', bgEl: '.side__link.is-active', need: 4.5 },
        { pair: 'sidebar link icon on sidebar (non-text)', fgSel: '.side__link:not(.is-active) svg', bgEl: '.side__link:not(.is-active)', need: 3, mode: 'border' },
      ];
      const pageContent = `(() => { ${helpers}
        const q = (s) => document.querySelector(s);
        const out = [];
        for (const p of ${JSON.stringify(probes)}) {
          const fe = q(p.fgSel); const be = q(p.bgEl);
          if (!fe || !be) { out.push({ pair: p.pair, missing: true }); continue; }
          const fgC = p.mode === 'border' ? parse(getComputedStyle(fe).fill === 'none' ? getComputedStyle(fe).color : getComputedStyle(fe).color) : fgOf(fe);
          const bg = effBg(be);
          out.push({ pair: p.pair, fg: show(fgC), bg: show(bg), opaque: bg.opaque, ratio: Math.round(ratio(fgC, bg) * 100) / 100, need: p.need });
        }
        return out; })()`;
      await page.goto('/');
      await settle(page);
      const basic = await page.evaluate(pageContent);
      for (const r of basic as Record<string, unknown>[]) if (!String(r.pair).startsWith('active')) rows.push(normalize(r));
      // Active sidebar link only exists on a tool route.
      await page.goto('/tools/compress');
      await settle(page);
      const onTool = await page.evaluate(pageContent);
      for (const r of onTool as Record<string, unknown>[]) if (String(r.pair).startsWith('active')) rows.push(normalize(r));

      // Primary button (enabled) on accent, and disabled primary, on compress before and after a file is added.
      await page.goto('/tools/compress');
      await settle(page);
      const disabled = await page.evaluate(`(() => { ${helpers}
        const b = document.querySelector('.pk-btn--primary:disabled');
        if (!b) return { missing: true };
        const bg = effBg(b); const fg = fgOf(b);
        return { pair: 'disabled primary button text on its background', fg: show(fg), bg: show(bg), opaque: bg.opaque, ratio: Math.round(ratio(fg, bg) * 100) / 100, need: 4.5 }; })()`);
      rows.push(normalize(disabled as Record<string, unknown>));
      await page.locator('input[type=file]').first().setInputFiles({ name: 'a11y.png', mimeType: 'image/png', buffer: PNG.sync.write(new PNG({ width: 8, height: 8 })) });
      await expect(page.getByRole('button', { name: 'Preview a11y.png', exact: true })).toBeVisible();
      const enabled = await page.evaluate(`(() => { ${helpers}
        const b = document.querySelector('.pk-btn--primary:not(:disabled)');
        if (!b) return { missing: true };
        const bg = effBg(b); const fg = fgOf(b);
        return { pair: 'primary button text on accent', fg: show(fg), bg: show(bg), opaque: bg.opaque, ratio: Math.round(ratio(fg, bg) * 100) / 100, need: 4.5 }; })()`);
      rows.push(normalize(enabled as Record<string, unknown>));

      // Input border (--border-strong) against input background and against surrounding panel.
      await page.goto('/');
      await settle(page);
      const inputs = await page.evaluate(`(() => { ${helpers}
        const inp = document.querySelector('.side__search input');
        if (!inp) return [{ missing: true }];
        const cs = getComputedStyle(inp);
        const border = parse(cs.borderTopColor);
        const inBg = effBg(inp);
        const outer = effBg(inp.parentElement);
        return [
          { pair: 'input border vs input background', fg: show(border), bg: show(inBg), opaque: inBg.opaque, ratio: Math.round(ratio(border, inBg) * 100) / 100, need: 3 },
          { pair: 'input border vs surrounding sidebar', fg: show(border), bg: show(outer), opaque: outer.opaque, ratio: Math.round(ratio(border, outer) * 100) / 100, need: 3 },
        ]; })()`);
      for (const r of inputs as Record<string, unknown>[]) rows.push(normalize(r));

      // Focus ring (outline) against canvas, sidebar and panel: focus real elements by keyboard.
      const focusRing = async (label: string, pick: string) => {
        await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); });
        await page.keyboard.press('Shift+Tab');
        const ok = await page.evaluate(`(() => { ${helpers}
          const el = document.querySelector(${JSON.stringify(pick)});
          return !!el; })()`);
        if (!ok) return rows.push({ pair: `focus ring on ${label}`, fg: '-', bg: '-', ratio: null, need: 3, pass: null, note: `selector not found: ${pick}` });
        await page.locator(pick).first().focus();
        const v = await page.evaluate(`(() => { ${helpers}
          const el = document.activeElement; if (!el) return null;
          const cs = getComputedStyle(el); const ring = parse(cs.outlineColor);
          const bg = effBg(el.parentElement);
          return { fg: show(ring), bg: show(bg), opaque: bg.opaque, ratio: Math.round(ratio(ring, bg) * 100) / 100, outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, focusVisible: el.matches(':focus-visible'), tag: el.tagName }; })()`);
        const r = v as { fg: string; bg: string; opaque: boolean; ratio: number; outlineStyle: string; outlineWidth: string; focusVisible: boolean; tag: string } | null;
        if (!r) return rows.push({ pair: `focus ring on ${label}`, fg: '-', bg: '-', ratio: null, need: 3, pass: null, note: 'no active element' });
        rows.push({ pair: `focus ring on ${label} (${r.tag}, outline ${r.outlineStyle} ${r.outlineWidth}, :focus-visible=${r.focusVisible})`, fg: r.fg, bg: r.bg, ratio: r.ratio, need: 3, pass: r.ratio >= 3 });
      };
      await page.goto('/tools/compress');
      await settle(page);
      await focusRing('canvas (topbar search)', '.topbar__search');
      await focusRing('sidebar (tool link)', '.side__link');
      await focusRing('panel (tray button)', '.tray button');

      // Status text on soft backgrounds, injected as real .pk-notice markup for measurement only.
      for (const kind of ['error', 'warn', 'success'] as const) {
        const r = await page.evaluate<{ fg: string; bg: string; opaque: boolean; ratio: number }>(`(() => { ${helpers}
          const host = document.querySelector('main') || document.body;
          const n = document.createElement('div'); n.className = 'pk-notice pk-notice--${kind}'; n.setAttribute('data-a11y-probe', '1');
          const span = document.createElement('span'); span.textContent = 'probe'; n.appendChild(span); host.appendChild(n);
          const fg = fgOf(span); const bg = effBg(n); n.remove();
          return { fg: show(fg), bg: show(bg), opaque: bg.opaque, ratio: Math.round(ratio(fg, bg) * 100) / 100 }; })()`);
        rows.push({ pair: `${kind} notice text on its soft background (text inherits .pk-notice color)`, ...r, need: 4.5, pass: r.ratio >= 4.5 });
      }

      // Final pass/fail, with null-ratio rows (missing selectors) recorded but not failed.
      const table = rows.map((r) => ({ theme, ...r, pass: r.pass ?? (r.ratio === null ? null : r.ratio >= r.need) }));
      for (const r of table) console.log(`CONTRAST|${theme}|${r.pair}|fg=${r.fg}|bg=${r.bg}|ratio=${r.ratio}|need=${r.need}|pass=${r.pass}${r.note ? '|' + r.note : ''}`);
      report(`contrast-${theme}`, testInfo, table);
      for (const r of table) {
        if (r.pass === null) continue;
        expect.soft(r.ratio, `${theme}: ${r.pair} ${r.ratio}:1 < ${r.need}:1`).toBeGreaterThanOrEqual(r.need);
      }
    });
  }
});

function normalize(r: Record<string, unknown>): { pair: string; fg: string; bg: string; ratio: number | null; need: number; pass: boolean | null; note?: string } {
  if (r.missing) return { pair: String(r.pair ?? 'probe'), fg: '-', bg: '-', ratio: null, need: 4.5, pass: null, note: 'selector not found' };
  const ratio = typeof r.ratio === 'number' ? r.ratio : null;
  const need = typeof r.need === 'number' ? r.need : 4.5;
  return {
    pair: String(r.pair), fg: String(r.fg), bg: String(r.bg), ratio, need,
    pass: ratio === null ? null : ratio >= need,
    note: r.opaque === false ? 'no opaque ancestor background found; white assumed' : undefined,
  };
}
