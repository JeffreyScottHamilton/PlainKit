import { callWorker } from '@/workers/rpc';
import { ToolError } from '@/lib/errors';
import type { EngineContext } from '@/jobs/types';
import { MAX_BYTES, type MediaInfo, type MediaRequest, type MediaResponse, type TranscodeOptions, type TranscodeResult, type Writable } from './containers';

const create = () => new Worker(new URL('./media.worker.ts', import.meta.url), { type: 'module' });
const call = (req: MediaRequest, signal: AbortSignal, onProgress?: EngineContext['onProgress']) => callWorker<MediaRequest, MediaResponse>(create, req, { signal, onProgress });

export async function probeWritable(signal: AbortSignal): Promise<Writable[]> {
  const r = await call({ type: 'probe' }, signal);
  return r.kind === 'probe' ? r.writable : [];
}
export async function inspectMedia(input: Blob, signal: AbortSignal): Promise<MediaInfo> {
  const r = await call({ type: 'inspect', input }, signal);
  if (r.kind !== 'inspect') throw new ToolError('unexpected', 'Could not read this file.');
  return r.info;
}
/** Convert or compress. The Blob is passed by reference (structured clone), so the original is untouched. */
export async function transcodeMedia(input: Blob, options: TranscodeOptions, ctx: EngineContext): Promise<TranscodeResult> {
  if (input.size > MAX_BYTES) throw new ToolError('too-large', 'This file is larger than 2 GB.', 'Outputs are built in memory, so very large files are not supported.');
  const r = await call({ type: 'transcode', input, ...options }, ctx.signal, ctx.onProgress);
  if (r.kind !== 'transcode') throw new ToolError('unexpected', 'The conversion returned nothing.');
  return r;
}
