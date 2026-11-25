import type { EditOptions } from './dsp';

export const EXPORT_FORMATS = ['wav', 'm4a', 'webm'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** Channels are the selected range only (copies), transferred to the worker. */
export type EditRequest = { type: 'export'; channels: Float32Array[]; sampleRate: number; options: EditOptions; format: ExportFormat };
export type EditResponse = { bytes: Uint8Array; mime: string; warnings: string[] };
