// Output containers the media engine can try to write. Which ones actually work is probed at runtime.
export type ContainerId = 'mp4' | 'webm' | 'mkv' | 'mov' | 'm4a' | 'ogg' | 'wav' | 'flac' | 'aac' | 'mp3';
export type Container = { id: ContainerId; label: string; ext: string; mime: string; kind: 'video' | 'audio' };

export const CONTAINERS: Container[] = [
  { id: 'mp4', label: 'MP4', ext: 'mp4', mime: 'video/mp4', kind: 'video' },
  { id: 'webm', label: 'WebM', ext: 'webm', mime: 'video/webm', kind: 'video' },
  { id: 'mkv', label: 'MKV', ext: 'mkv', mime: 'video/x-matroska', kind: 'video' },
  { id: 'mov', label: 'MOV', ext: 'mov', mime: 'video/quicktime', kind: 'video' },
  { id: 'm4a', label: 'M4A (AAC)', ext: 'm4a', mime: 'audio/mp4', kind: 'audio' },
  { id: 'ogg', label: 'Ogg', ext: 'ogg', mime: 'audio/ogg', kind: 'audio' },
  { id: 'wav', label: 'WAV', ext: 'wav', mime: 'audio/wav', kind: 'audio' },
  { id: 'flac', label: 'FLAC', ext: 'flac', mime: 'audio/flac', kind: 'audio' },
  { id: 'aac', label: 'AAC (ADTS)', ext: 'aac', mime: 'audio/aac', kind: 'audio' },
  { id: 'mp3', label: 'MP3', ext: 'mp3', mime: 'audio/mpeg', kind: 'audio' },
];
export const containerById = (id: ContainerId): Container => CONTAINERS.find((c) => c.id === id)!;

export type QualityPreset = 'low' | 'medium' | 'high';
export type Writable = { id: ContainerId; video: string | null; audio: string | null };

export type MediaInfo = {
  durationSec: number;
  video: { codec: string | null; width: number; height: number; canDecode: boolean } | null;
  audio: { codec: string | null; channels: number; sampleRate: number; canDecode: boolean } | null;
};

export type TranscodeOptions = {
  container: ContainerId;
  /** Re-encode even when the tracks could be copied (used by Compress). */
  force: boolean;
  quality?: QualityPreset;
  /** Downscale so the height is at most this. 0 or undefined keeps the original size. Never upscales. */
  maxHeight?: number;
  audioBitrate?: number;
};

export type MediaRequest =
  | { type: 'probe' }
  | { type: 'inspect'; input: Blob }
  | ({ type: 'transcode'; input: Blob } & TranscodeOptions);

export type TranscodeResult = {
  kind: 'transcode';
  bytes: ArrayBuffer;
  info: MediaInfo;
  sourceSec: number;
  verified: boolean;
  warnings: string[];
};
export type MediaResponse = { kind: 'probe'; writable: Writable[] } | { kind: 'inspect'; info: MediaInfo } | TranscodeResult;

export const DURATION_TOLERANCE_SEC = 0.5;
/** Outputs are assembled in memory. */
export const WARN_BYTES = 500 * 1024 * 1024;
export const MAX_BYTES = 2 * 1024 * 1024 * 1024;

/** Height to request: only when the source is taller than the cap. Even number for encoders. */
export function targetHeight(sourceHeight: number, maxHeight: number | undefined): number | undefined {
  if (!maxHeight || sourceHeight <= maxHeight) return undefined;
  return maxHeight - (maxHeight % 2);
}

export function describe(info: MediaInfo): string {
  const parts = [`${info.durationSec.toFixed(1)} s`];
  if (info.video) parts.push(`${info.video.width}×${info.video.height} ${info.video.codec ?? 'unknown video'}`);
  if (info.audio) parts.push(`${info.audio.codec ?? 'unknown audio'} ${info.audio.channels} ch ${info.audio.sampleRate} Hz`);
  return parts.join(' · ');
}
