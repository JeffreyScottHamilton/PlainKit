import { callWorker } from '@/workers/rpc';
import { ToolError } from '@/lib/errors';
import type { EngineContext } from '@/jobs/types';
import type { EncodeOptions, EncodeResult, InspectResult, WorkerRequest, WorkerResponse } from './types';

function createImageWorker(): Worker {
  return new Worker(new URL('../../workers/image.worker.ts', import.meta.url), { type: 'module' });
}

const unexpected = () => new ToolError('unexpected', 'The image worker returned an unexpected answer.', 'Try again.');

/** Original blob is passed by reference (structured clone), never transferred, so the session asset stays intact. */
export async function encodeImage(blob: Blob, options: EncodeOptions, ctx: EngineContext): Promise<EncodeResult> {
  const res = await callWorker<WorkerRequest, WorkerResponse>(createImageWorker, { type: 'encode', blob, options }, { signal: ctx.signal, onProgress: ctx.onProgress });
  if (res.kind !== 'encode') throw unexpected();
  return res.value;
}

export async function inspectImage(blob: Blob): Promise<InspectResult> {
  const res = await callWorker<WorkerRequest, WorkerResponse>(createImageWorker, { type: 'inspect', blob }, { signal: new AbortController().signal });
  if (res.kind !== 'inspect') throw unexpected();
  return res.value;
}
