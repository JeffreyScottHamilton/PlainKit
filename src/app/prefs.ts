import { createStore } from '@/lib/store';
import { getTool } from '@/registry';

export type Theme = 'dark' | 'light' | 'system';
export type Prefs = { theme: Theme; favorites: string[]; recents: string[] };

export const PREFS_KEY = 'plainkit:prefs';
export const MAX_RECENTS = 5;

const defaults = (): Prefs => ({ theme: 'dark', favorites: [], recents: [] });

export function isTheme(v: unknown): v is Theme {
  return v === 'dark' || v === 'light' || v === 'system';
}
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
/** Keeps only ids that still exist in the registry; drops duplicates. */
function toolIds(v: unknown, max?: number): string[] {
  if (!Array.isArray(v)) return [];
  const list: unknown[] = v;
  const ids = list.filter((x): x is string => typeof x === 'string' && getTool(x) !== undefined);
  return [...new Set(ids)].slice(0, max);
}

/** Untrusted stored JSON in, valid prefs out. Anything malformed falls back to defaults per field. */
export function parsePrefs(raw: unknown): Prefs {
  if (!isRecord(raw)) return defaults();
  return {
    theme: isTheme(raw.theme) ? raw.theme : 'dark',
    favorites: toolIds(raw.favorites),
    recents: toolIds(raw.recents, MAX_RECENTS),
  };
}

export function nextRecents(recents: string[], id: string): string[] {
  return [id, ...recents.filter((r) => r !== id)].slice(0, MAX_RECENTS);
}

export function resolveTheme(theme: Theme, systemPrefersLight: boolean): 'dark' | 'light' {
  return theme === 'system' ? (systemPrefersLight ? 'light' : 'dark') : theme;
}

function loadPrefs(): Prefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (raw === null) return defaults();
    const parsed: unknown = JSON.parse(raw);
    return parsePrefs(parsed);
  } catch {
    return defaults(); // storage blocked or corrupt: run with defaults, in memory
  }
}
function savePrefs(p: Prefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // storage blocked: preference lasts for this tab only
  }
}

const systemLight = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: light)') : null;
const store = createStore<Prefs>(loadPrefs());

function applyTheme() {
  document.documentElement.dataset.theme = resolveTheme(store.get().theme, systemLight?.matches === true);
}
applyTheme();
store.subscribe(() => {
  savePrefs(store.get());
  applyTheme();
});
systemLight?.addEventListener('change', () => applyTheme());

export function getPrefs(): Prefs {
  return store.get();
}
export function usePrefs(): Prefs {
  return store.use((s) => s);
}
export function setTheme(theme: Theme) {
  store.set((s) => ({ ...s, theme }));
}
export function toggleFavorite(id: string) {
  store.set((s) => ({ ...s, favorites: s.favorites.includes(id) ? s.favorites.filter((f) => f !== id) : [...s.favorites, id] }));
}
export function removeFavorite(id: string) {
  store.set((s) => ({ ...s, favorites: s.favorites.filter((f) => f !== id) }));
}
export function recordRecent(id: string) {
  store.set((s) => ({ ...s, recents: nextRecents(s.recents, id) }));
}
