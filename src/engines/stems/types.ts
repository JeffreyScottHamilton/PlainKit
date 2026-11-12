import type { StemName } from './model';

export type SeparateRequest = {
  type: 'separate';
  /** 1 or 2 channels at 44.1 kHz. Copies: the worker may keep them. */
  channels: Float32Array[];
  engine: { models: Record<StemName, ArrayBuffer>; wasm: ArrayBuffer };
};

export type SeparateResponse = {
  stems: { stem: StemName; wav: Uint8Array }[];
  /** Seconds spent in the network calls plus DSP, for the speed estimate. */
  processingMs: number;
  segments: number;
};
