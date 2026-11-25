export type RecordingKind = 'screen' | 'camera' | 'voice';

const LABEL: Record<RecordingKind, string> = { screen: 'Screen recording', camera: 'Camera recording', voice: 'Voice memo' };

const pad = (n: number) => String(n).padStart(2, '0');

/** Local date and time, safe in filenames: 2026-11-25 19-02. */
export function stamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

/** e.g. "Screen recording 2026-11-25 19-02.webm" */
export function recordingName(kind: RecordingKind, when: Date, ext: string): string {
  return `${LABEL[kind]} ${stamp(when)}.${ext}`;
}
