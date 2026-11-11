import { ToolError } from '@/lib/errors';
import type { JobProgress } from '@/jobs/types';

// Typed worker messaging. One worker per call: cancel = terminate, which always works
// even for engines that cannot stop cooperatively.
// shortcut: no worker pool; add one if startup cost shows up in measurements.
type Out<Res> =
  | { type: 'progress'; progress: JobProgress }
  | { type: 'done'; result: Res }
  | { type: 'error'; code: string; message: string; nextAction?: string };

export function callWorker<Req, Res>(
  create: () => Worker,
  req: Req,
  opts: { signal: AbortSignal; onProgress?: (p: JobProgress) => void; transfer?: Transferable[] },
): Promise<Res> {
  return new Promise<Res>((resolve, reject) => {
    if (opts.signal.aborted) return reject(new DOMException('Canceled', 'AbortError'));
    const w = create();
    const finish = (fn: () => void) => {
      opts.signal.removeEventListener('abort', onAbort);
      w.terminate();
      fn();
    };
    const onAbort = () => finish(() => reject(new DOMException('Canceled', 'AbortError')));
    opts.signal.addEventListener('abort', onAbort);
    w.onmessage = (e: MessageEvent<Out<Res>>) => {
      const m = e.data;
      if (m.type === 'progress') opts.onProgress?.(m.progress);
      else if (m.type === 'done') finish(() => resolve(m.result));
      else finish(() => reject(new ToolError(m.code, m.message, m.nextAction)));
    };
    w.onerror = (e) => finish(() => reject(new ToolError('worker-crash', e.message || 'The processing worker stopped unexpectedly.', 'Try again with a smaller file.')));
    w.postMessage(req, opts.transfer ?? []);
  });
}

/** Worker side: serve(async (req, onProgress) => ({ result, transfer })) */
export function serve<Req, Res>(
  handler: (req: Req, onProgress: (p: JobProgress) => void) => Promise<{ result: Res; transfer?: Transferable[] }>,
) {
  const post = (m: Out<Res>, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);
  self.onmessage = async (e: MessageEvent<Req>) => {
    try {
      const { result, transfer } = await handler(e.data, (progress) => post({ type: 'progress', progress }));
      post({ type: 'done', result }, transfer);
    } catch (err) {
      const t = err instanceof ToolError ? err : undefined;
      post({ type: 'error', code: t?.code ?? 'unexpected', message: err instanceof Error ? err.message : String(err), nextAction: t?.nextAction });
    }
  };
}
