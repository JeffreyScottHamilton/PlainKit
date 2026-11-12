import type { AudioCodec, VideoCodec } from 'mediabunny';

// Typed worker protocol. One discriminated union per direction.
export type TrimRequest = {
  type: 'trim';
  input: Blob;
  startSec: number;
  endSec: number;
  format: 'mp4' | 'webm';
  videoCodec: VideoCodec | null;
  audioCodec: AudioCodec | null;
};
export type RemuxRequest = { type: 'remux'; segments: ArrayBuffer[]; expectedSec: number };
export type WorkerRequest = TrimRequest | RemuxRequest;

export type TrimResult = {
  kind: 'trim';
  bytes: ArrayBuffer;
  mode: 'copied' | 're-encoded';
  durationSec: number;
  requestedSec: number;
  verified: boolean;
  width: number;
  height: number;
  warnings: string[];
};
export type RemuxResult =
  | { kind: 'mp4'; bytes: ArrayBuffer; durationSec: number; verified: boolean }
  | { kind: 'joined-ts'; bytes: ArrayBuffer; reason: string };
export type WorkerResponse = TrimResult | RemuxResult;

/** Output duration must match the requested range within this many seconds to count as verified. */
export const TRIM_TOLERANCE_SEC = 0.5;
export const REMUX_TOLERANCE_SEC = 1;
