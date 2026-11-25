// Single-frame capture from the preview element. Runs on the main thread: one drawImage, no re-encode.
import { ToolError } from '@/lib/errors';
import { outputName } from '@/lib/format';
import { formatTimecode } from './timecode';

/** clip.mp4 at 83.456 s -> clip-frame-01-23-456.png (colons and dots are not safe in file names). */
export function frameFileName(sourceName: string, sec: number): string {
  return outputName(sourceName, `frame-${formatTimecode(sec).replace(/[:.]/g, '-')}`, 'png');
}

export function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  if (video.readyState < 2 || video.videoWidth === 0) {
    return Promise.reject(new ToolError('no-frame', 'The preview has no picture yet.', 'Play or seek the video, then try again.'));
  }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new ToolError('no-canvas', 'This browser could not draw the frame.', 'Try another browser.'));
  ctx.drawImage(video, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new ToolError('encode-failed', 'This browser could not write the frame as PNG.', 'Try again, or pause the video first.'))),
      'image/png',
    ),
  );
}
