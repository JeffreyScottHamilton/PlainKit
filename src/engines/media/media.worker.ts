import {
  ALL_FORMATS, AdtsOutputFormat, BlobSource, BufferSource, BufferTarget, Conversion, FlacOutputFormat, Input, MkvOutputFormat, MovOutputFormat,
  Mp3OutputFormat, Mp4OutputFormat, OggOutputFormat, Output, QUALITY_HIGH, QUALITY_LOW, QUALITY_MEDIUM, UnsupportedInputFormatError, WavOutputFormat,
  WebMOutputFormat, getFirstEncodableAudioCodec, getFirstEncodableVideoCodec, type OutputFormat, type Source,
} from 'mediabunny';
import { serve } from '@/workers/rpc';
import { ToolError } from '@/lib/errors';
import { CONTAINERS, DURATION_TOLERANCE_SEC, containerById, targetHeight, type ContainerId, type MediaInfo, type MediaRequest, type MediaResponse, type TranscodeResult, type Writable } from './containers';

function formatFor(id: ContainerId): OutputFormat {
  switch (id) {
    case 'mp4': case 'm4a': return new Mp4OutputFormat();
    case 'webm': return new WebMOutputFormat();
    case 'mkv': return new MkvOutputFormat();
    case 'mov': return new MovOutputFormat();
    case 'ogg': return new OggOutputFormat();
    case 'wav': return new WavOutputFormat();
    case 'flac': return new FlacOutputFormat();
    case 'aac': return new AdtsOutputFormat();
    case 'mp3': return new Mp3OutputFormat();
  }
}
const QUALITY = { low: QUALITY_LOW, medium: QUALITY_MEDIUM, high: QUALITY_HIGH };

/** Which containers this browser can really write, by asking its encoders. */
async function probe(): Promise<Writable[]> {
  const out: Writable[] = [];
  for (const c of CONTAINERS) {
    try {
      const f = formatFor(c.id);
      const video = c.kind === 'video' ? await getFirstEncodableVideoCodec(f.getSupportedVideoCodecs()) : null;
      const audio = await getFirstEncodableAudioCodec(f.getSupportedAudioCodecs());
      if (c.kind === 'video' ? video : audio) out.push({ id: c.id, video, audio });
    } catch {
      // No WebCodecs here: nothing is writable.
    }
  }
  return out;
}

async function inspect(source: Source): Promise<MediaInfo> {
  const input = new Input({ source, formats: ALL_FORMATS });
  try {
    const durationSec = await input.computeDuration();
    const v = await input.getPrimaryVideoTrack();
    const a = await input.getPrimaryAudioTrack();
    return {
      durationSec,
      video: v ? { codec: v.codec, width: v.displayWidth, height: v.displayHeight, canDecode: await v.canDecode() } : null,
      audio: a ? { codec: a.codec, channels: a.numberOfChannels, sampleRate: a.sampleRate, canDecode: await a.canDecode() } : null,
    };
  } catch (e) {
    if (e instanceof UnsupportedInputFormatError) throw new ToolError('unsupported-input', 'This file is not a supported audio or video format.', 'Try MP4, WebM, MKV, MOV, MP3, WAV, Ogg, FLAC or AAC.');
    throw e;
  } finally {
    input.dispose();
  }
}

async function transcode(req: Extract<MediaRequest, { type: 'transcode' }>, onProgress: (f: number) => void): Promise<TranscodeResult> {
  const c = containerById(req.container);
  const source = await inspect(new BlobSource(req.input));
  const warnings: string[] = [];
  if (c.kind === 'audio' && !source.audio) throw new ToolError('no-audio', 'This file has no audio track.', 'Choose a video format instead.');
  if (c.kind === 'video' && !source.video) throw new ToolError('no-video', 'This file has no video track.', 'Choose an audio format instead.');

  const input = new Input({ source: new BlobSource(req.input), formats: ALL_FORMATS });
  try {
    const output = new Output({ format: formatFor(req.container), target: new BufferTarget() });
    const q = req.quality ? QUALITY[req.quality] : undefined;
    const conv = await Conversion.init({
      input,
      output,
      video: c.kind === 'video' ? { height: targetHeight(source.video?.height ?? 0, req.maxHeight), fit: 'contain', bitrate: q, forceTranscode: req.force } : { discard: true },
      audio: { bitrate: req.audioBitrate ?? q, forceTranscode: req.force },
    });
    for (const d of conv.discardedTracks) {
      if (d.track.type === 'video' && c.kind === 'audio') continue; // dropping the picture is the point of an audio format
      warnings.push(`A ${d.track.type} track was left out (${String(d.reason).replace(/_/g, ' ')}).`);
    }
    if (!conv.isValid) throw new ToolError('cannot-convert', `This browser cannot write this file as ${c.label}.`, 'Choose another output format.');
    conv.onProgress = (p) => onProgress(p);
    await conv.execute();
    const bytes = output.target.buffer;
    if (!bytes) throw new ToolError('no-output', 'No output was produced.', 'Try another output format.');
    const info = await inspect(new BufferSource(bytes));
    const verified = Math.abs(info.durationSec - source.durationSec) <= DURATION_TOLERANCE_SEC && (c.kind === 'audio' ? Boolean(info.audio) : Boolean(info.video));
    if (c.kind === 'video' && source.audio && !info.audio) warnings.push('The output has no audio: this browser cannot write audio in this format.');
    return { kind: 'transcode', bytes, info, sourceSec: source.durationSec, verified, warnings };
  } finally {
    input.dispose();
  }
}

serve<MediaRequest, MediaResponse>(async (req, onProgress) => {
  if (req.type === 'probe') return { result: { kind: 'probe', writable: await probe() } };
  if (req.type === 'inspect') return { result: { kind: 'inspect', info: await inspect(new BlobSource(req.input)) } };
  const result = await transcode(req, (f) => onProgress({ stage: 'processing', fraction: f }));
  return { result, transfer: [result.bytes] };
});
