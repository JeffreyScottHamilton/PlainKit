import { callWorker } from '@/workers/rpc';
import { ToolError } from '@/lib/errors';
import type { EngineContext } from '@/jobs/types';
import type { Region } from './model';
import type { RedactRequest, RedactResponse, RenderFormat, RenderOutput } from './types';

function createRedactWorker(): Worker {
  return new Worker(new URL('../../workers/redact.worker.ts', import.meta.url), { type: 'module' });
}

/** The original blob is passed by reference, so the session asset stays intact. */
export async function renderRedactedInWorker(blob: Blob, regions: Region[], format: RenderFormat, ctx: EngineContext): Promise<RenderOutput> {
  const res = await callWorker<RedactRequest, RedactResponse>(createRedactWorker, { type: 'render', blob, regions, format }, { signal: ctx.signal, onProgress: ctx.onProgress });
  if (res.kind !== 'render') throw new ToolError('unexpected', 'The redaction worker returned an unexpected answer.', 'Try again.');
  return res.value;
}
