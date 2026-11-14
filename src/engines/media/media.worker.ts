import {
  ALL_FORMATS, AdtsOutputFormat, BlobSource, BufferSource, BufferTarget, Conversion, FlacOutputFormat, Input, MkvOutputFormat, MovOutputFormat,
  Mp3OutputFormat, Mp4OutputFormat, OggOutputFormat, Output, QUALITY_HIGH, QUALITY_LOW, QUALITY_MEDIUM, UnsupportedInputFormatError, WavOutputFormat,
  WebMOutputFormat, canEncodeAudio, getFirstEncodableAudioCodec, getFirstEncodableVideoCodec, type AudioCodec, type OutputFormat, type Source, type VideoCodec,
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
// Formats whose name promises a codec only count as writable with that codec. Without this, a browser with no
// AAC encoder would quietly put Opus into an ".m4a", which many players cannot open.
const AUDIO_FOR: Partial<Record<ContainerId, AudioCodec[]>> = { m4a: ['aac'], aac: ['aac'], mp3: ['mp3'], flac: ['flac'], ogg: ['opus', 'vorbis'], mp4: ['aac'], mov: ['aac'] };

// The same rule for video: people expect an MP4 or MOV to hold H.264 (or HEVC) and a WebM to hold VP9/VP8/AV1.
// Copying VP8 into an MP4 is technically allowed but many players, including iPhones, will not open it.
const VIDEO_FOR: Partial<Record<ContainerId, VideoCodec[]>> = { mp4: ['avc', 'hevc'], mov: ['avc', 'hevc'], webm: ['vp9', 'vp8', 'av1'] };

// Browsers rarely encode MP3 or FLAC, and some lack AAC. These encoders (LAME, libFLAC, FFmpeg's AAC, compiled to
// WebAssembly) fill the gap. Each is its own lazily loaded file, fetched only when that format is written and the
// browser cannot do it natively.
const BUNDLED: AudioCodec[] = ['mp3', 'flac', 'aac'];
const ready = new Set<AudioCodec>();
async function ensureEncoder(codec: AudioCodec): Promise<boolean> {
  if (ready.has(codec)) return true;
  if (!(await canEncodeAudio(codec).catch(() => false))) {
    if (codec === 'mp3') (await import('@mediabunny/mp3-encoder')).registerMp3Encoder();
    else if (codec === 'flac') (await import('@mediabunny/flac-encoder')).registerFlacEncoder();
    else if (codec === 'aac') (await import('@mediabunny/aac-encoder')).registerAacEncoder();
    else return false;
  }
  ready.add(codec);
  return true;
}

/** Which containers this browser can really write, by asking its encoders. */
async function probe(): Promise<Writable[]> {
  const out: Writable[] = [];
  for (const c of CONTAINERS) {
    try {
      const f = formatFor(c.id);
      const video = c.kind === 'video' ? await getFirstEncodableVideoCodec(VIDEO_FOR[c.id] ?? f.getSupportedVideoCodecs()) : null;
      const wanted = AUDIO_FOR[c.id];
      // A bundled encoder counts as available without loading it here; it is fetched when a conversion needs it.
      const audio = (await getFirstEncodableAudioCodec(wanted ?? f.getSupportedAudioCodecs())) ?? wanted?.find((a) => BUNDLED.includes(a)) ?? null;
      if (c.kind === 'video' ? video : audio) out.push({ id: c.id, video, audio });
    } catch {
      // No WebCodecs here: nothing is writable.
    }
  }
  return out;
}

/** The codec to write, when the format demands one. Keeps the source codec if it already fits (so it can be copied). */
async function audioCodecFor(id: ContainerId, sourceCodec: string | null): Promise<AudioCodec | undefined> {
  const allowed = AUDIO_FOR[id];
  if (!allowed) return undefined;
  if (sourceCodec && (allowed as string[]).includes(sourceCodec)) return sourceCodec as AudioCodec;
  for (const c of allowed) {
    if (BUNDLED.includes(c) ? await ensureEncoder(c) : await canEncodeAudio(c).catch(() => false)) return c;
  }
  return undefined;
}

/** Keeps the source codec when the format allows it (so it can be copied); otherwise the first one this browser can encode. */
async function videoCodecFor(id: ContainerId, sourceCodec: string | null): Promise<VideoCodec | undefined> {
  const allowed = VIDEO_FOR[id];
  if (!allowed) return undefined;
  if (sourceCodec && (allowed as string[]).includes(sourceCodec)) return sourceCodec as VideoCodec;
  return (await getFirstEncodableVideoCodec(allowed)) ?? undefined;
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
      video: c.kind === 'video' ? { height: targetHeight(source.video?.height ?? 0, req.maxHeight), fit: 'contain', bitrate: q, forceTranscode: req.force, codec: await videoCodecFor(req.container, source.video?.codec ?? null) } : { discard: true },
      audio: { bitrate: req.audioBitrate ?? q, forceTranscode: req.force, codec: await audioCodecFor(req.container, source.audio?.codec ?? null) },
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
