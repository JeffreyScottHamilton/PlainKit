// Test-only fixture: encodes a short H.264 MPEG-TS clip with mediabunny. Imported by e2e/video.spec.ts through
// the dev server. No app code imports this module, so it is not in the production bundle.
import { BufferTarget, CanvasSource, MpegTsOutputFormat, Output, QUALITY_MEDIUM } from 'mediabunny';

export async function makeMpegTsClip(seconds: number, fps = 30): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(320, 240);
  const ctx = canvas.getContext('2d')!;
  const output = new Output({ format: new MpegTsOutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_MEDIUM });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();
  for (let i = 0; i < seconds * fps; i++) {
    ctx.fillStyle = `hsl(${(i * 5) % 360} 80% 50%)`;
    ctx.fillRect(0, 0, 320, 240);
    await source.add(i / fps, 1 / fps);
  }
  await output.finalize();
  return new Uint8Array(output.target.buffer!);
}
