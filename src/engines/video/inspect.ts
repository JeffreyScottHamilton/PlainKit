// Main-thread inspection and capability checks. Reads metadata only; no re-encoding.
import {
  ALL_FORMATS,
  BlobSource,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  UnsupportedInputFormatError,
  WebMOutputFormat,
  Input,
  type AudioCodec,
  type VideoCodec,
} from 'mediabunny';

export type VideoInfo = {
  container: string;
  mimeType: string;
  durationSec: number;
  width: number;
  height: number;
  frameRate: number | null;
  videoCodec: string | null;
  audio: { codec: string | null; channels: number; sampleRate: number } | null;
};
export type Inspection = { ok: true; info: VideoInfo } | { ok: false; reason: string };

export async function inspectVideo(blob: Blob): Promise<Inspection> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    let container: string;
    let mimeType: string;
    try {
      container = (await input.getFormat()).name;
      mimeType = await input.getMimeType();
    } catch (e) {
      if (e instanceof UnsupportedInputFormatError) {
        return { ok: false, reason: 'This file is not a container Plainkit can read. Supported: MP4, MOV, WebM, Matroska (MKV) and MPEG-TS.' };
      }
      throw e;
    }
    const video = await input.getPrimaryVideoTrack();
    if (!video) return { ok: false, reason: 'No video track was found. Audio-only files cannot be trimmed here.' };
    const videoCodec = video.codec;
    if (!(await video.canDecode())) {
      return { ok: false, reason: `This browser cannot decode the video codec${videoCodec ? ` (${videoCodec})` : ''}.` };
    }
    const durationSec = await input.computeDuration();
    const frameRate = await video.computeFrameRateMetrics().then((m) => m.underlyingFrameRate ?? m.bestGuessFrameRate, () => null);
    const audioTrack = await input.getPrimaryAudioTrack();
    return {
      ok: true,
      info: {
        container,
        mimeType,
        durationSec,
        width: video.displayWidth,
        height: video.displayHeight,
        frameRate: frameRate ? Math.round(frameRate * 100) / 100 : null,
        videoCodec,
        audio: audioTrack ? { codec: audioTrack.codec, channels: audioTrack.numberOfChannels, sampleRate: audioTrack.sampleRate } : null,
      },
    };
  } finally {
    input.dispose();
  }
}

export type OutputId = 'mp4' | 'webm';
export type OutputOption = { id: OutputId; label: string; available: boolean; videoCodec: VideoCodec | null; audioCodec: AudioCodec | null };

/** Which containers this browser can actually write for this frame size. Unavailable ones are shown as such, never offered. */
export async function outputOptions(width: number, height: number): Promise<OutputOption[]> {
  const mp4 = new Mp4OutputFormat();
  const webm = new WebMOutputFormat();
  const pick = async (id: OutputId, label: string, format: { getSupportedVideoCodecs(): VideoCodec[]; getSupportedAudioCodecs(): AudioCodec[] }): Promise<OutputOption> => {
    const videoCodec = await getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), { width, height });
    const audioCodec = await getFirstEncodableAudioCodec(format.getSupportedAudioCodecs());
    return { id, label, available: videoCodec !== null, videoCodec, audioCodec };
  };
  return [await pick('mp4', 'MP4', mp4), await pick('webm', 'WebM', webm)];
}
