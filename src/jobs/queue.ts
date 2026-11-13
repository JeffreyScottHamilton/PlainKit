import { useMemo } from 'react';
import { createStore } from '@/lib/store';
import { uid } from '@/lib/format';
import { isAbort, toToolError } from '@/lib/errors';
import { addGenerated } from '@/session/store';
import { announce } from '@/app/announce';
import type { EngineContext, EngineResult, Job } from './types';

type Spec = {
  toolId: string;
  label: string;
  inputIds: string[];
  /** Heavy jobs run one at a time (memory-aware default). Light jobs start immediately. */
  heavy?: boolean;
  run: (ctx: EngineContext) => Promise<EngineResult>;
};

export const jobs = createStore<Job[]>([]);
const controllers = new Map<string, AbortController>();
const pending: { id: string; spec: Spec }[] = [];
let heavyRunning = 0;

const patch = (id: string, p: Partial<Job>) => jobs.set((js) => js.map((j) => (j.id === id ? { ...j, ...p } : j)));

async function start(id: string, spec: Spec) {
  const ctl = controllers.get(id);
  if (!ctl || ctl.signal.aborted) {
    // Never started: still release the heavy slot that pump() reserved, or later jobs would wait forever.
    if (spec.heavy) {
      heavyRunning--;
      pump();
    }
    return;
  }
  patch(id, { state: 'running' });
  try {
    const res = await spec.run({ signal: ctl.signal, onProgress: (progress) => patch(id, { progress }) });
    if (ctl.signal.aborted) throw new DOMException('Canceled', 'AbortError');
    const assets = res.outputs.map((o) => addGenerated({ ...o, parentIds: spec.inputIds }));
    patch(id, { state: 'complete', result: { assets, warnings: res.warnings ?? [] }, finishedAt: Date.now(), progress: undefined });
    announce(`${spec.label} finished.`);
  } catch (e) {
    if (ctl.signal.aborted || isAbort(e)) {
      patch(id, { state: 'canceled', finishedAt: Date.now(), progress: undefined });
    } else {
      const error = toToolError(e);
      patch(id, { state: 'failed', error, finishedAt: Date.now(), progress: undefined });
      announce(`${spec.label} failed. ${error.message}`);
    }
  } finally {
    controllers.delete(id);
    if (spec.heavy) {
      heavyRunning--;
      pump();
    }
  }
}

function pump() {
  while (heavyRunning < 1 && pending.length) {
    const next = pending.shift()!;
    heavyRunning++;
    void start(next.id, next.spec);
  }
}

export function enqueue(spec: Spec): string {
  const id = uid();
  controllers.set(id, new AbortController());
  jobs.set((js) => [...js, { id, toolId: spec.toolId, label: spec.label, inputIds: spec.inputIds, state: 'queued', createdAt: Date.now() }]);
  if (spec.heavy) {
    pending.push({ id, spec });
    pump();
  } else void start(id, spec);
  return id;
}

export function cancelJob(id: string) {
  const i = pending.findIndex((p) => p.id === id);
  if (i >= 0) pending.splice(i, 1);
  controllers.get(id)?.abort();
  const j = jobs.get().find((x) => x.id === id);
  if (j && j.state === 'queued') {
    controllers.delete(id);
    patch(id, { state: 'canceled', finishedAt: Date.now() });
  }
}
export function cancelAll() {
  jobs.get().filter((j) => j.state === 'queued' || j.state === 'running').forEach((j) => cancelJob(j.id));
}
export function removeJob(id: string) {
  cancelJob(id);
  jobs.set((js) => js.filter((j) => j.id !== id));
}
export function dropAllJobs() {
  cancelAll();
  jobs.set([]);
}

export const isActive = (j: Job) => j.state === 'queued' || j.state === 'running';
export function useJobs(toolId?: string): Job[] {
  const all = jobs.use((s) => s);
  return useMemo(() => (toolId ? all.filter((j) => j.toolId === toolId) : all), [all, toolId]);
}
