// Page side: one worker per call (cancel = terminate), typed through gif.worker.ts.
import { callWorker } from '@/workers/rpc';
import { ToolError } from '@/lib/errors';
import type { EngineContext } from '@/jobs/types';
import type { Entry, ExportResult, FrameSpec, GifOptions, GifRequest, GifResult, ProbeResult } from './types';

const create = () => new Worker(new URL('../../workers/gif.worker.ts', import.meta.url), { type: 'module' });
const unexpected = () => new ToolError('unexpected', 'The GIF worker returned an unexpected answer.', 'Try again.');

export async function probeGif(spec: FrameSpec, signal: AbortSignal): Promise<ProbeResult> {
  const r = await callWorker<GifRequest, GifResult>(create, { type: 'probe', spec }, { signal });
  if (r.kind !== 'probe') throw unexpected();
  return r;
}

export async function exportGif(spec: FrameSpec, entries: Entry[], options: GifOptions, ctx: EngineContext): Promise<ExportResult> {
  const r = await callWorker<GifRequest, GifResult>(create, { type: 'export', spec, entries, options }, { signal: ctx.signal, onProgress: ctx.onProgress });
  if (r.kind !== 'export') throw unexpected();
  return r;
}
