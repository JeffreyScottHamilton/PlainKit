import type { Segment } from './cues';

export type TranscribeRequest = {
  type: 'transcribe';
  /** Mono, 16 kHz, float32 PCM. Transferred, not copied. */
  pcm: Float32Array;
  /** Store model files in Cache Storage under CACHE_NAME (opt-in). */
  keep: boolean;
};
export type TranscribeResponse = { segments: Segment[]; loadMs: number; inferMs: number; cacheWarning: string | null };
