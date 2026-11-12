/* Plainkit service worker. Built from src/app/sw.template.js by vite.config.ts.
   Caches only this app's own static files. It never caches user files, models or the ONNX wasm. */
const VERSION = '__VERSION__';
const SHELL = __SHELL__;
const ALL = __ALL__;
const CACHE = 'plainkit-app-' + VERSION;
const PREFIX = 'plainkit-app-';

self.addEventListener('install', (e) => {
  // No skipWaiting here: a new version activates only when the user chooses to reload.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const cacheable = (url) => url.pathname.startsWith('/assets/') || (url.pathname.startsWith('/engines/') && url.pathname.endsWith('.mjs'));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // App routes are client-side: serve the cached shell, fall back to the network.
    e.respondWith(caches.match('/', { cacheName: CACHE, ignoreVary: true }).then((hit) => hit || fetch(req)));
    return;
  }
  if (!cacheable(url)) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true, ignoreVary: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
      return res;
    }),
  );
});

self.addEventListener('message', (e) => {
  const reply = (m) => e.source && e.source.postMessage(m);
  if (e.data === 'skip-waiting') self.skipWaiting();
  if (e.data === 'info') {
    caches.open(CACHE).then(async (c) => {
      const have = new Set((await c.keys()).map((r) => new URL(r.url).pathname));
      const cached = ALL.filter((a) => have.has(a.url));
      reply({ type: 'info', version: VERSION, total: ALL.length, totalBytes: ALL.reduce((n, a) => n + a.bytes, 0), cached: cached.length, cachedBytes: cached.reduce((n, a) => n + a.bytes, 0) });
    });
  }
  if (e.data === 'cache-all') {
    caches
      .open(CACHE)
      .then(async (c) => {
        const have = new Set((await c.keys()).map((r) => new URL(r.url).pathname));
        for (const a of ALL) if (!have.has(a.url)) await c.add(a.url);
        reply({ type: 'cache-all', ok: true });
      })
      .catch((err) => reply({ type: 'cache-all', ok: false, message: String((err && err.name) || err) }));
  }
});
