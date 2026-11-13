import { useMemo } from 'react';
import { createStore } from '@/lib/store';
import { uid } from '@/lib/format';
import type { SessionAsset } from './types';

// Session is tab-scoped and memory-only. Nothing here is persisted.
type State = { assets: SessionAsset[]; inputs: Record<string, string[]> };
export const session = createStore<State>({ assets: [], inputs: {} });

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif',
  bmp: 'image/bmp', svg: 'image/svg+xml', heic: 'image/heic', heif: 'image/heic', tif: 'image/tiff', tiff: 'image/tiff',
  pdf: 'application/pdf', csv: 'text/csv', tsv: 'text/tab-separated-values', json: 'application/json', txt: 'text/plain',
  md: 'text/markdown', srt: 'application/x-subrip', vtt: 'text/vtt',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', aac: 'audio/aac', opus: 'audio/ogg',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska', m3u8: 'application/vnd.apple.mpegurl',
  obj: 'model/obj', stl: 'model/stl', gltf: 'model/gltf+json', glb: 'model/gltf-binary', ply: 'model/ply',
};

/** Best-effort MIME from browser type or extension. Engines must still validate content. */
export function guessMime(name: string, type?: string): string {
  if (type && type !== 'application/octet-stream') return type;
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  return EXT_MIME[ext] ?? 'application/octet-stream';
}

const urls = new Map<string, string>();
/** Object URL for an asset, created lazily and revoked when the asset is removed. */
export function assetUrl(asset: SessionAsset): string {
  let u = urls.get(asset.id);
  if (!u) {
    u = URL.createObjectURL(asset.blob);
    urls.set(asset.id, u);
  }
  return u;
}
function revoke(id: string) {
  const u = urls.get(id);
  if (u) URL.revokeObjectURL(u);
  urls.delete(id);
}

function linkInputs(inputs: State['inputs'], toolId: string, ids: string[]) {
  const cur = inputs[toolId] ?? [];
  return { ...inputs, [toolId]: [...cur, ...ids.filter((i) => !cur.includes(i))] };
}

/** Import user files. If toolId is given they also become that tool's inputs. Never starts work. */
export function addFiles(files: Iterable<File>, toolId?: string): SessionAsset[] {
  const added = [...files].map<SessionAsset>((f) => ({
    id: uid(), name: f.name, mime: guessMime(f.name, f.type), size: f.size, blob: f,
    origin: 'imported', parentIds: [], createdAt: Date.now(),
  }));
  session.set((s) => ({
    assets: [...s.assets, ...added],
    inputs: toolId ? linkInputs(s.inputs, toolId, added.map((a) => a.id)) : s.inputs,
  }));
  return added;
}

export function addGenerated(o: { name: string; mime: string; blob: Blob; parentIds: string[] }): SessionAsset {
  const asset: SessionAsset = { id: uid(), ...o, size: o.blob.size, origin: 'generated', createdAt: Date.now() };
  session.set((s) => ({ ...s, assets: [...s.assets, asset] }));
  return asset;
}

export function removeAsset(id: string) {
  revoke(id);
  session.set((s) => ({
    assets: s.assets.filter((a) => a.id !== id),
    inputs: Object.fromEntries(Object.entries(s.inputs).map(([k, v]) => [k, v.filter((i) => i !== id)])),
  }));
}

/** Hand assets to a tool as inputs (in memory, no download). Caller navigates to /tools/<toolId>. */
export function sendTo(toolId: string, ids: string[]) {
  session.set((s) => ({ ...s, inputs: linkInputs(s.inputs, toolId, ids) }));
}
export function setInputs(toolId: string, ids: string[]) {
  session.set((s) => ({ ...s, inputs: { ...s.inputs, [toolId]: ids } }));
}
export function removeInput(toolId: string, id: string) {
  setInputs(toolId, (session.get().inputs[toolId] ?? []).filter((i) => i !== id));
}

export function getAsset(id: string): SessionAsset | undefined {
  return session.get().assets.find((a) => a.id === id);
}

/** Internal: drop every asset and URL. Use clearSession() from session/clear.ts in UI code. */
export function dropAllAssets() {
  [...urls.keys()].forEach(revoke);
  session.set({ assets: [], inputs: {} });
}

export function useAssets(): SessionAsset[] {
  return session.use((s) => s.assets);
}
export function useToolInputs(toolId: string): SessionAsset[] {
  const assets = session.use((s) => s.assets);
  const ids = session.use((s) => s.inputs[toolId]);
  return useMemo(() => (ids ?? []).flatMap((id) => assets.find((a) => a.id === id) ?? []), [assets, ids]);
}
