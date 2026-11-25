// Main-thread side of the PDF password tool. Every operation runs in one worker; cancel terminates it.
import { ToolError } from '@/lib/errors';
import type { JobProgress } from '@/jobs/types';
import { callWorker } from '@/workers/rpc';
import type { LockOptions, Inspection } from './ops';

export type { Inspection, LockOptions } from './ops';

export type PdfLockRequest =
  | { readonly type: 'inspect'; readonly blob: Blob }
  | { readonly type: 'unlock'; readonly blob: Blob; readonly password: string }
  | { readonly type: 'lock'; readonly blob: Blob; readonly options: LockOptions };

export type PdfLockResponse =
  | { readonly kind: 'inspect'; readonly inspection: Inspection }
  | { readonly kind: 'unlock'; readonly bytes: Uint8Array; readonly opensWithoutPassword: boolean }
  | { readonly kind: 'lock'; readonly bytes: Uint8Array };

const create = () => new Worker(new URL('../../workers/pdf-lock.worker.ts', import.meta.url), { type: 'module' });
const unexpected = () => new ToolError('unexpected', 'The PDF worker sent an unexpected reply.', 'Try again.');

type Ctl = { signal: AbortSignal; onProgress?: (p: JobProgress) => void };

async function send(req: PdfLockRequest, ctl: Ctl): Promise<PdfLockResponse> {
  return callWorker<PdfLockRequest, PdfLockResponse>(create, req, ctl);
}

export async function inspectPdfFile(blob: Blob, ctl: Ctl): Promise<Inspection> {
  const res = await send({ type: 'inspect', blob }, ctl);
  if (res.kind !== 'inspect') throw unexpected();
  return res.inspection;
}

export async function unlockPdfFile(blob: Blob, password: string, ctl: Ctl): Promise<{ blob: Blob; opensWithoutPassword: boolean }> {
  const res = await send({ type: 'unlock', blob, password }, ctl);
  if (res.kind !== 'unlock') throw unexpected();
  return { blob: new Blob([res.bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), opensWithoutPassword: res.opensWithoutPassword };
}

export async function lockPdfFile(blob: Blob, options: LockOptions, ctl: Ctl): Promise<Blob> {
  const res = await send({ type: 'lock', blob, options }, ctl);
  if (res.kind !== 'lock') throw unexpected();
  return new Blob([res.bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}
