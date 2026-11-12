import { CACHE_NAME, CACHE_PREFIX } from './model';

// Opt-in Cache API storage for downloaded model and engine files. Only caches whose name starts
// with CACHE_PREFIX are ever read, listed or deleted here: never user files.

const hasCaches = () => typeof caches !== 'undefined';

/** Cached bytes for a same-origin URL key, or null. Never throws: a broken cache just means "download". */
export async function readCached(key: string): Promise<ArrayBuffer | null> {
  if (!hasCaches()) return null;
  try {
    const res = await (await caches.open(CACHE_NAME)).match(key);
    return res ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** Store bytes; returns a warning instead of throwing (quota exceeded, storage blocked). */
export async function writeCached(key: string, bytes: ArrayBuffer): Promise<string | null> {
  if (!hasCaches()) return 'This browser has no Cache Storage, so the model will be downloaded again next time.';
  try {
    const res = new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.byteLength) } });
    await (await caches.open(CACHE_NAME)).put(key, res);
    return null;
  } catch (e) {
    const quota = e instanceof DOMException && e.name === 'QuotaExceededError';
    return quota
      ? 'Not enough storage to keep the model on this device. It stays in memory for this session only.'
      : 'Could not keep the model on this device. It stays in memory for this session only.';
  }
}

/** Model caches on this device with their stored size. For the Settings page and the Cutout tool. */
export async function listModelCaches(): Promise<{ name: string; bytes: number }[]> {
  if (!hasCaches()) return [];
  const names = (await caches.keys()).filter((n) => n.startsWith(CACHE_PREFIX));
  return Promise.all(
    names.map(async (name) => {
      const cache = await caches.open(name);
      let bytes = 0;
      for (const req of await cache.keys()) {
        const res = await cache.match(req);
        const len = Number(res?.headers.get('Content-Length'));
        bytes += Number.isFinite(len) && len > 0 ? len : ((await res?.blob())?.size ?? 0);
      }
      return { name, bytes };
    }),
  );
}

/** Delete every Plainkit model cache (all versions). */
export async function deleteModelCaches(): Promise<void> {
  if (!hasCaches()) return;
  const names = (await caches.keys()).filter((n) => n.startsWith(CACHE_PREFIX));
  await Promise.all(names.map((n) => caches.delete(n)));
}
