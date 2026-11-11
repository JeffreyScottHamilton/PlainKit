import type { SessionAsset } from '@/session/types';
import type { ToolError } from '@/lib/errors';

export type JobProgress = {
  stage: 'loading-engine' | 'inspecting' | 'processing' | 'exporting';
  fraction?: number; // 0..1 only when genuinely known
  message?: string;
};
export type ToolResult = { assets: SessionAsset[]; warnings: string[] };

/** What an engine returns: raw outputs. The queue turns them into session assets. */
export type EngineOutput = { name: string; mime: string; blob: Blob };
export type EngineResult = { outputs: EngineOutput[]; warnings?: string[] };
export type EngineContext = { signal: AbortSignal; onProgress: (p: JobProgress) => void };

export type JobState = 'queued' | 'running' | 'complete' | 'canceled' | 'failed';
export type Job = {
  id: string;
  toolId: string;
  label: string;
  inputIds: string[];
  state: JobState;
  progress?: JobProgress;
  result?: ToolResult;
  error?: ToolError;
  createdAt: number;
  finishedAt?: number;
};
