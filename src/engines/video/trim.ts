// Main-thread wrapper: runs the trim in the video worker. Cancel = terminate the worker (callWorker).
import { callWorker } from '@/workers/rpc';
import { ToolError } from '@/lib/errors';
import { outputName } from '@/lib/format';
import type { EngineContext, EngineResult } from '@/jobs/types';
import type { OutputOption } from './inspect';
import type { TrimResult, WorkerRequest, WorkerResponse } from './messages';

export const SIZE_WARN_BYTES = 500 * 1024 * 1024;
export const SIZE_WARN_TEXT = 'Outputs are built in memory. Sources over 500 MB may fail on this device. Shorter clips or smaller files are safer.';

export const createVideoWorker = () => new Worker(new URL('./video.worker.ts', import.meta.url), { type: 'module' });

/** Extra details per output blob, for the result view. Released with the asset. */
export const trimDetails = new WeakMap<Blob, TrimResult>();

export async function runTrim(
  blob: Blob,
  name: string,
  opts: { startSec: number; endSec: number; output: OutputOption },
  ctx: EngineContext,
): Promise<EngineResult> {
  if (!opts.output.available || !opts.output.videoCodec) throw new ToolError('output-unavailable', `This browser cannot write ${opts.output.label}.`, 'Choose the other output format.');
  const req: WorkerRequest = {
    type: 'trim',
    input: blob,
    startSec: opts.startSec,
    endSec: opts.endSec,
    format: opts.output.id,
    videoCodec: opts.output.videoCodec,
    audioCodec: opts.output.audioCodec,
  };
  ctx.onProgress({ stage: 'processing', message: 'Starting' });
  const res = await callWorker<WorkerRequest, WorkerResponse>(createVideoWorker, req, { signal: ctx.signal, onProgress: ctx.onProgress });
  if (res.kind !== 'trim') throw new ToolError('unexpected', 'The video worker returned an unexpected result.', 'Try again.');
  const out = new Blob([res.bytes], { type: `video/${opts.output.id}` });
  trimDetails.set(out, res);
  return {
    outputs: [{ name: outputName(name, 'trimmed', opts.output.id === 'mp4' ? 'mp4' : 'webm'), mime: `video/${opts.output.id}`, blob: out }],
    warnings: res.warnings,
  };
}
