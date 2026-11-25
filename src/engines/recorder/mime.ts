// Recording type choices, best first. Pure: the caller supplies the browser's support check.

export type MediaKind = 'video' | 'audio';
export type TypeSupport = (type: string) => boolean;

const CANDIDATES: Record<MediaKind, readonly string[]> = {
  video: ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'],
  audio: ['audio/mp4', 'audio/webm;codecs=opus'],
};

/** First candidate the browser can record, or null to let MediaRecorder choose its own default. */
export function pickMime(kind: MediaKind, supports: TypeSupport): string | null {
  return CANDIDATES[kind].find((t) => supports(t)) ?? null;
}

/** Type without parameters: 'video/webm;codecs=vp9,opus' -> 'video/webm'. */
export function baseType(mime: string): string {
  return (mime.split(';')[0] ?? '').trim().toLowerCase();
}

const EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
};

/** File extension for a recorded type. Unknown types fall back to webm, the usual MediaRecorder output. */
export function extensionFor(mime: string): string {
  return EXTENSIONS[baseType(mime)] ?? 'webm';
}
