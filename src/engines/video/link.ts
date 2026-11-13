// Save-from-link. The browser requests the URL directly (CORS, no credentials). Nothing goes through a Plainkit server.
import { ToolError, isAbort } from '@/lib/errors';
import { outputName } from '@/lib/format';
import type { EngineContext } from '@/jobs/types';
import { parseHls, type HlsParsed, hostsOf } from './hls';

export const MAX_DOWNLOAD_BYTES = 2 * 1024 ** 3;
const MAX_PLAYLIST_BYTES = 1024 * 1024;

export const CORS_MESSAGE = 'The site did not allow this page to download the file (CORS), or it could not be reached.';
export const CORS_NEXT = 'Open the link in a new tab and save it from there, then drop the file here.';

/** Common video platforms. Their pages need extraction, which this tool does not do. */
export const PLATFORM_HOSTS = ['youtube.com', 'youtu.be', 'tiktok.com', 'vimeo.com', 'facebook.com', 'fb.watch', 'instagram.com', 'twitter.com', 'x.com', 'twitch.tv', 'dailymotion.com'];
export const PLATFORM_MESSAGE = 'Video pages on platforms like this are not supported. This tool only saves direct media links.';

export type LinkValidation =
  | { ok: true; url: URL }
  | { ok: false; kind: 'empty' | 'invalid' | 'scheme' | 'credentials' | 'platform'; message: string };

export function isPlatformHost(host: string): boolean {
  const h = host.toLowerCase();
  return PLATFORM_HOSTS.some((p) => h === p || h.endsWith(`.${p}`));
}

/** Validates the pasted text before any request. Only https:// without credentials; platform pages are refused. */
export function validateLink(raw: string): LinkValidation {
  const s = raw.trim();
  if (!s) return { ok: false, kind: 'empty', message: '' };
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return { ok: false, kind: 'invalid', message: 'This is not a valid link. Paste a full address that starts with https://.' };
  }
  if (url.protocol !== 'https:') return { ok: false, kind: 'scheme', message: 'Only https:// links are supported.' };
  if (url.username || url.password) return { ok: false, kind: 'credentials', message: 'Links with a username or password in them are not supported.' };
  if (isPlatformHost(url.hostname)) return { ok: false, kind: 'platform', message: PLATFORM_MESSAGE };
  return { ok: true, url };
}

const MEDIA_EXT: Record<string, string> = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska', ts: 'video/mp2t', m4a: 'audio/mp4', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac', aac: 'audio/aac', opus: 'audio/ogg' };
const HLS_TYPES = ['application/vnd.apple.mpegurl', 'application/x-mpegurl', 'audio/mpegurl', 'audio/x-mpegurl'];

export type LinkKind = { kind: 'media'; mime: string } | { kind: 'hls' } | { kind: 'rejected'; message: string };

/** Accepts video/*, audio/*, octet-stream with a media extension, or an HLS playlist type. */
export function classifyResponse(contentType: string | null, pathname: string): LinkKind {
  const ct = (contentType ?? '').split(';')[0]!.trim().toLowerCase();
  const ext = pathname.slice(pathname.lastIndexOf('.') + 1).toLowerCase();
  if (HLS_TYPES.includes(ct) || (ext === 'm3u8' && (ct === '' || ct === 'text/plain' || ct === 'application/octet-stream'))) return { kind: 'hls' };
  if (ct.startsWith('video/') || ct.startsWith('audio/')) return { kind: 'media', mime: ct };
  if ((ct === 'application/octet-stream' || ct === '') && MEDIA_EXT[ext]) return { kind: 'media', mime: MEDIA_EXT[ext]! };
  return { kind: 'rejected', message: `The site sent a type this tool does not accept (${ct || 'no content type'}). Only video, audio and HLS playlists can be saved.` };
}

/** Last path segment, decoded and sanitized. Adds an extension from the MIME type when missing. */
export function fileNameFor(url: URL, mime: string): string {
  let seg = url.pathname.split('/').pop() ?? '';
  try {
    seg = decodeURIComponent(seg);
  } catch {
    // keep the raw segment
  }
  const base = seg || 'download';
  const ext = Object.entries(MEDIA_EXT).find(([, m]) => m === mime)?.[0];
  return outputName(base.includes('.') ? base : `${base}${ext ? `.${ext}` : ''}`, '');
}

/** Fetch with CORS, no credentials. A CORS block and a network failure look the same to the browser, so one message covers both. */
export async function openLink(url: string, signal: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { mode: 'cors', credentials: 'omit', signal, cache: 'no-store' });
  } catch (e) {
    if (isAbort(e)) throw e;
    throw new ToolError('cors-or-network', CORS_MESSAGE, CORS_NEXT);
  }
  if (!res.ok) throw new ToolError('http-status', `The site answered with HTTP ${res.status}.`, 'Check the link, or open it in a new tab.');
  return res;
}

export async function fetchPlaylist(url: string, signal: AbortSignal): Promise<HlsParsed> {
  const res = await openLink(url, signal);
  const len = Number(res.headers.get('content-length'));
  if (len > MAX_PLAYLIST_BYTES) return { ok: false, message: 'This playlist is too large to be a playlist.' };
  const text = await res.text();
  if (text.length > MAX_PLAYLIST_BYTES) return { ok: false, message: 'This playlist is too large to be a playlist.' };
  return parseHls(text, url);
}

export type LinkCheck =
  | { kind: 'media'; host: string; mime: string; size?: number; name: string }
  | { kind: 'hls-master'; host: string; hosts: string[]; name: string; variants: { label: string; bandwidth: number }[] }
  | { kind: 'hls-media'; host: string; hosts: string[]; name: string; segments: number; totalSec: number }
  | { kind: 'hls-error'; host: string; message: string };

/** Contacts the link to see what it is. For direct media only the headers are read; the body is dropped. */
export async function checkLink(url: URL, signal: AbortSignal): Promise<LinkCheck> {
  const host = url.host;
  const res = await openLink(url.href, signal);
  const kind = classifyResponse(res.headers.get('content-type'), url.pathname);
  if (kind.kind === 'rejected') {
    await res.body?.cancel().catch(() => undefined);
    throw new ToolError('type-rejected', kind.message, 'Open the link in a new tab to check what it is.');
  }
  if (kind.kind === 'hls') {
    await res.body?.cancel().catch(() => undefined);
    const parsed = await fetchPlaylist(url.href, signal);
    const name = fileNameFor(url, 'application/vnd.apple.mpegurl').replace(/\.m3u8$/i, '');
    if (!parsed.ok) return { kind: 'hls-error', host, message: parsed.message };
    if (parsed.kind === 'master')
      return { kind: 'hls-master', host, hosts: hostsOf(parsed.variants.map((v) => v.url)), name, variants: parsed.variants.map((v, i) => ({ label: v.resolution ? `${v.resolution.height}p` : `Variant ${i + 1}`, bandwidth: v.bandwidth })) };
    return { kind: 'hls-media', host, hosts: hostsOf(parsed.segments.map((s) => s.url)), name, segments: parsed.segments.length, totalSec: parsed.totalSec };
  }
  const len = Number(res.headers.get('content-length'));
  await res.body?.cancel().catch(() => undefined);
  return { kind: 'media', host, mime: kind.mime, size: Number.isFinite(len) && len > 0 ? len : undefined, name: fileNameFor(url, kind.mime) };
}

/** Streams the body with progress. Fraction only when Content-Length is known. Enforces the 2 GB cap. */
async function readBody(res: Response, ctx: EngineContext, label: string): Promise<Blob> {
  const total = Number(res.headers.get('content-length'));
  const known = Number.isFinite(total) && total > 0 ? total : undefined;
  if (known && known > MAX_DOWNLOAD_BYTES) throw tooLarge();
  const type = (res.headers.get('content-type') ?? '').split(';')[0]!.trim();
  const reader = res.body?.getReader();
  if (!reader) return new Blob([await res.arrayBuffer()], { type });
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let got = 0;
  try {
    for (;;) {
      ctx.signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      got += value.byteLength;
      if (got > MAX_DOWNLOAD_BYTES) throw tooLarge();
      parts.push(value as Uint8Array<ArrayBuffer>);
      ctx.onProgress({ stage: 'processing', fraction: known ? Math.min(1, got / known) : undefined, message: label });
    }
  } finally {
    if (ctx.signal.aborted) await reader.cancel().catch(() => undefined);
  }
  return new Blob(parts, { type });
}

export function tooLarge() {
  return new ToolError('too-large', 'This file is larger than 2 GB, so Plainkit will not save it.', 'Download it in a new tab instead, then drop the file here to trim it.');
}

/** Direct media download. Returns the file as one output named from the URL path. */
export async function downloadMedia(url: URL, ctx: EngineContext): Promise<{ name: string; mime: string; blob: Blob }> {
  const res = await openLink(url.href, ctx.signal);
  const kind = classifyResponse(res.headers.get('content-type'), url.pathname);
  if (kind.kind !== 'media') throw new ToolError('type-rejected', kind.kind === 'rejected' ? kind.message : 'This link is a playlist, not a file.', 'Use Check link first, then choose a quality.');
  const blob = await readBody(res, ctx, 'Downloading');
  return { name: fileNameFor(url, kind.mime), mime: kind.mime, blob };
}

