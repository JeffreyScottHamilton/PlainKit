import { createStore } from '@/lib/store';

// Offline support. Registered in production builds only. Updates never reload the page by themselves.
export type OfflineInfo = { version: string; total: number; totalBytes: number; cached: number; cachedBytes: number };
type State = { supported: boolean; active: boolean; updateWaiting: boolean; info: OfflineInfo | null; busy: boolean; error: string | null };

export const pwa = createStore<State>({ supported: 'serviceWorker' in navigator, active: false, updateWaiting: false, info: null, busy: false, error: null });
let reg: ServiceWorkerRegistration | null = null;

function post(msg: string) {
  (reg?.active ?? navigator.serviceWorker.controller)?.postMessage(msg);
}

export function refreshOfflineInfo() {
  post('info');
}

export async function registerPwa() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  try {
    navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
      const d = e.data as { type?: string; ok?: boolean; message?: string } & Partial<OfflineInfo>;
      if (d?.type === 'info') pwa.set((s) => ({ ...s, info: d as OfflineInfo }));
      if (d?.type === 'cache-all') {
        pwa.set((s) => ({
          ...s,
          busy: false,
          error: d.ok ? null : d.message === 'QuotaExceededError' ? 'Not enough storage on this device to save every tool.' : 'Could not save every tool. Check the connection and try again.',
        }));
        refreshOfflineInfo();
      }
    });
    reg = await navigator.serviceWorker.register('/sw.js');
    const waiting = () => pwa.set((s) => ({ ...s, updateWaiting: Boolean(reg?.waiting && navigator.serviceWorker.controller) }));
    waiting();
    reg.addEventListener('updatefound', () => {
      const sw = reg?.installing;
      sw?.addEventListener('statechange', () => {
        if (sw.state === 'installed') waiting();
        if (sw.state === 'activated') {
          pwa.set((s) => ({ ...s, active: true }));
          refreshOfflineInfo();
        }
      });
    });
    await navigator.serviceWorker.ready;
    pwa.set((s) => ({ ...s, active: true }));
    refreshOfflineInfo();
  } catch {
    pwa.set((s) => ({ ...s, supported: false }));
  }
}

/** User-initiated only. Activates the waiting version, then reloads once it controls the page. */
export function applyUpdate() {
  if (!reg?.waiting) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  reg.waiting.postMessage('skip-waiting');
}

export function saveAllForOffline() {
  pwa.set((s) => ({ ...s, busy: true, error: null }));
  post('cache-all');
}

/** Removes the offline copy of the app (not model caches, not preferences). */
export async function removeOfflineCopy() {
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k.startsWith('plainkit-app-')).map((k) => caches.delete(k)));
  await reg?.unregister();
  reg = null;
  pwa.set((s) => ({ ...s, active: false, info: null, updateWaiting: false }));
}
