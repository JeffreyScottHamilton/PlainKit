// Saves a VOD HLS playlist (MPEG-TS segments). Segments are fetched one by one; progress is segmentsDone / total.
import { callWorker } from '@/workers/rpc';
import { ToolError } from '@/lib/errors';
import { outputName } from '@/lib/format';
import type { EngineContext, EngineResult } from '@/jobs/types';
import { fetchPlaylist, MAX_DOWNLOAD_BYTES, openLink, tooLarge } from './link';
import { createVideoWorker } from './trim';
import type { RemuxResult, WorkerRequest, WorkerResponse } from './messages';

export const hlsDetails = new WeakMap<Blob, RemuxResult>();

/** variantIndex is required when the URL is a master playlist (the user picks a quality). */
export async function saveHls(url: URL, variantIndex: number | undefined, ctx: EngineContext): Promise<EngineResult> {
  ctx.onProgress({ stage: 'inspecting', message: 'Reading playlist' });
  let playlist = await fetchPlaylist(url.href, ctx.signal);
  let playlistUrl = url.href;
  if (!playlist.ok) throw new ToolError('hls-unsupported', playlist.message, 'Try a different link.');
  if (playlist.kind === 'master') {
    const v = variantIndex === undefined ? undefined : playlist.variants[variantIndex];
    if (!v) throw new ToolError('hls-choose-variant', 'Choose a quality first.', 'Use Check link, then pick one of the qualities.');
    playlistUrl = v.url;
    playlist = await fetchPlaylist(v.url, ctx.signal);
    if (!playlist.ok) throw new ToolError('hls-unsupported', playlist.message, 'Try a different quality or link.');
    if (playlist.kind !== 'media') throw new ToolError('hls-unsupported', 'Nested playlists are not supported.', 'Try a different link.');
  }
  if (playlist.kind !== 'media') throw new ToolError('hls-unsupported', 'This link is not a media playlist.', 'Try a different link.');

  const segments = playlist.segments;
  const parts: ArrayBuffer[] = [];
  let bytes = 0;
  for (let i = 0; i < segments.length; i++) {
    ctx.signal.throwIfAborted();
    const res = await openLink(segments[i]!.url, ctx.signal);
    const buf = await res.arrayBuffer();
    bytes += buf.byteLength;
    if (bytes > MAX_DOWNLOAD_BYTES) throw tooLarge();
    parts.push(buf);
    ctx.onProgress({ stage: 'processing', fraction: (i + 1) / segments.length, message: `Segment ${i + 1} of ${segments.length}` });
  }

  ctx.onProgress({ stage: 'exporting', message: 'Assembling' });
  const req: WorkerRequest = { type: 'remux', segments: parts, expectedSec: playlist.totalSec };
  const res = await callWorker<WorkerRequest, WorkerResponse>(createVideoWorker, req, { signal: ctx.signal, transfer: parts });
  if (res.kind === 'trim') throw new ToolError('unexpected', 'The video worker returned an unexpected result.', 'Try again.');

  const stem = new URL(playlistUrl).pathname.split('/').pop()?.replace(/\.m3u8$/i, '') || 'stream';
  if (res.kind === 'mp4') {
    const blob = new Blob([res.bytes], { type: 'video/mp4' });
    hlsDetails.set(blob, res);
    const warnings = res.verified ? [] : [`The output is ${res.durationSec.toFixed(2)} s, not the ${playlist.totalSec.toFixed(2)} s listed in the playlist. It is not verified.`];
    return { outputs: [{ name: outputName(stem, 'remuxed', 'mp4'), mime: 'video/mp4', blob }], warnings };
  }
  const blob = new Blob([res.bytes], { type: 'video/mp2t' });
  hlsDetails.set(blob, res);
  return {
    outputs: [{ name: outputName(stem, 'joined', 'ts'), mime: 'video/mp2t', blob }],
    warnings: ['Joined .ts file. Some players cannot open it.', `Could not remux to MP4 (${res.reason}), so the segments were joined as they are.`],
  };
}
