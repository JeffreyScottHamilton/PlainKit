import { type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Production-only CSP. Dev needs inline scripts and websockets for HMR.
// connect-src stays 'self' + blob/data: tools that contact other hosts are documented in docs/network-boundaries.md.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self' blob: data: https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const csp = (): Plugin => ({
  name: 'plainkit-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<!--csp-->', `<meta http-equiv="Content-Security-Policy" content="${CSP}">`),
});


// Service worker generated after the bundle is written, so it can list the real hashed files.
// Shell files are cached on install. Tool chunks are cached the first time they load, or all at once
// when the user asks in Settings. Models and the ONNX wasm are never cached here (Cutout has its own opt-in cache).
const shellFiles = new Set<string>();
const serviceWorker = (): Plugin => ({
  name: 'plainkit-sw',
  apply: 'build',
  // Shell = entry chunk plus everything it imports statically (so a first visit can reload offline).
  writeBundle(_options, bundle) {
    for (const c of Object.values(bundle)) {
      if (c.type !== 'chunk' || !c.isEntry) continue;
      const walk = (name: string) => {
        const m = bundle[name];
        if (!m || m.type !== 'chunk' || shellFiles.has(name)) return;
        shellFiles.add(name);
        m.imports.forEach(walk);
        const meta = (m as unknown as { viteMetadata?: { importedCss?: Set<string>; importedAssets?: Set<string> } }).viteMetadata;
        meta?.importedCss?.forEach((f) => shellFiles.add(f));
      };
      walk(c.fileName);
    }
  },
  closeBundle() {
    if (shellFiles.size === 0) return; // worker sub-builds
    const dist = fileURLToPath(new URL('./dist', import.meta.url));
    const assets = readdirSync(join(dist, 'assets')).map((f) => ({ url: `/assets/${f}`, bytes: statSync(join(dist, 'assets', f)).size }));
    const html = readFileSync(join(dist, 'index.html'), 'utf8');
    const shell = ['/', '/icon.svg', ...assets.map((a) => a.url).filter((u) => shellFiles.has(u.slice(1)) || html.includes(u) || /inter-latin-wght.*\.woff2$/.test(u))];
    const version = createHash('sha256').update(assets.map((a) => a.url).join('|') + html).digest('hex').slice(0, 12);
    const template = readFileSync(fileURLToPath(new URL('./src/app/sw.template.js', import.meta.url)), 'utf8');
    writeFileSync(
      join(dist, 'sw.js'),
      template.replace('__VERSION__', version).replace('__SHELL__', JSON.stringify(shell)).replace('__ALL__', JSON.stringify(assets)),
    );
  },
});

export default defineConfig({
  plugins: [react(), csp(), serviceWorker()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: false },
  test: { environment: 'happy-dom', include: ['src/**/*.test.{ts,tsx}'] },
});
