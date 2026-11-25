const MIME: Record<string, string> = {
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', tsv: 'text/tab-separated-values', json: 'application/json',
  xml: 'application/xml', html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', srt: 'application/x-subrip',
  vtt: 'text/vtt', pdf: 'application/pdf', zip: 'application/zip', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml',
  heic: 'image/heic', heif: 'image/heic', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', opus: 'audio/ogg',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
};

/** MIME from the file extension only. Unknown extensions fall back to application/octet-stream. */
export function mimeFor(path: string): string {
  const dot = path.lastIndexOf('.');
  if (dot < 0) return 'application/octet-stream';
  return MIME[path.slice(dot + 1).toLowerCase()] ?? 'application/octet-stream';
}
