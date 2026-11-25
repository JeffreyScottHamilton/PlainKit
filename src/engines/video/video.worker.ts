import { ALL_FORMATS, BlobSource, BufferSource, BufferTarget, Conversion, Input, MPEG_TS, Mp4OutputFormat, Output, QUALITY_HIGH, WebMOutputFormat } from 'mediabunny';
import { serve } from '@/workers/rpc';
import { ToolError } from '@/lib/errors';
import type { JobProgress } from '@/jobs/types';
import { REMUX_TOLERANCE_SEC, TRIM_TOLERANCE_SEC, type WorkerRequest, type WorkerResponse, type TrimRequest, type RemuxRequest, type TrimResult, type RemuxResult } from './messages';
import { expectedRotation } from './rotate';

const encodeFailed = () => new ToolError('encode-failed', 'This browser could not write this video.', 'Try the other output format (WebM or MP4), or a different file.');

type Attempt = { bytes: ArrayBuffer; discarded: number } | null;

async function durationOf(bytes: ArrayBuffer): Promise<{ sec: number; width: number; height: number; rotation: number }> {
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  try {
    const sec = await input.computeDuration();
    const video = await input.getPrimaryVideoTrack();
    return { sec, width: video?.displayWidth ?? 0, height: video?.displayHeight ?? 0, rotation: video?.rotation ?? 0 };
  } finally {
    input.dispose();
  }
}

async function sourceRotation(blob: Blob): Promise<number> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    return video?.rotation ?? 0;
  } finally {
    input.dispose();
  }
}

async function trim(req: TrimRequest, onProgress: (p: JobProgress) => void): Promise<TrimResult> {
  const requested = req.endSec - req.startSec;
  const warnings: string[] = [];
  const format = () => (req.format === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat());
  const rotate = req.rotate === 0 ? undefined : req.rotate;
  // A turn can be stored as metadata (no re-encode) only if the container supports it. Otherwise frames are re-rendered.
  const metadataOk = req.rotate === 0 || format().supportsVideoTransformationMetadata;

  // copy: packets are copied without decoding, so the cut lands on a keyframe at or before the start.
  const attempt = async (copy: boolean): Promise<Attempt> => {
    const input = new Input({ source: new BlobSource(req.input), formats: ALL_FORMATS });
    try {
      const output = new Output({ format: format(), target: new BufferTarget() });
      const conv = await Conversion.init({
        input,
        output,
        trim: { start: req.startSec, end: req.endSec },
        copy: copy ? { mode: 'forced', boundaryPolicy: 'expand' } : false,
        ...(copy ? { ...(rotate !== undefined ? { video: { rotate } } : {}), ...(req.muted ? { audio: { discard: true } } : {}) } : { video: { codec: req.videoCodec ?? undefined, quality: QUALITY_HIGH, rotate }, audio: req.audioCodec && !req.muted ? { codec: req.audioCodec, quality: QUALITY_HIGH } : { discard: true } }),
      });
      if (!conv.isValid) return null;
      // Audio the user chose to drop is expected; any other discarded track means the copy cannot be used.
      if (copy && conv.discardedTracks.some((d) => d.reason !== 'discarded_by_user')) return null;
      conv.onProgress = (p) => onProgress({ stage: 'processing', fraction: p, message: copy ? 'Copying without re-encoding' : 'Re-encoding' });
      await conv.execute();
      const buf = output.target.buffer;
      return buf ? { bytes: buf, discarded: conv.discardedTracks.length } : null;
    } finally {
      input.dispose();
    }
  };

  const wantRot = expectedRotation(req.rotate === 0 ? 0 : await sourceRotation(req.input), req.rotate);
  const copied = req.allowCopy && metadataOk ? await attempt(true) : null;
  if (copied) {
    const d = await durationOf(copied.bytes);
    const rotOk = d.rotation === wantRot;
    if (Math.abs(d.sec - requested) <= TRIM_TOLERANCE_SEC && rotOk) {
      return { kind: 'trim', bytes: copied.bytes, mode: 'copied', durationSec: d.sec, requestedSec: requested, verified: true, width: d.width, height: d.height, rotate: req.rotate, rotation: d.rotation, warnings };
    }
    if (!rotOk) warnings.push(`Copying did not store the rotation (the file reports ${d.rotation}°, expected ${wantRot}°), so the video was re-encoded.`);
    else warnings.push(`Copying without re-encoding gave ${d.sec.toFixed(2)} s, not ${requested.toFixed(2)} s (cut on a keyframe), so the video was re-encoded.`);
  } else if (req.rotate !== 0 && !metadataOk) {
    warnings.push(`${req.format === 'mp4' ? 'MP4' : 'WebM'} cannot store a rotation without re-encoding, so the frames were re-rendered to rotate them.`);
  } else {
    warnings.push(req.allowCopy ? 'This trim cannot be copied without re-encoding in this format, so the video was re-encoded.' : `The source video is not in a codec that belongs in ${req.format === 'mp4' ? 'an MP4' : 'a WebM'}, so it was re-encoded.`);
  }

  if (!req.videoCodec) throw encodeFailed();
  if (!req.audioCodec && !req.muted) warnings.push('This browser cannot write audio in this format, so the output has no audio.');
  const re = await attempt(false);
  if (!re) throw encodeFailed();
  const d = await durationOf(re.bytes);
  const verified = Math.abs(d.sec - requested) <= TRIM_TOLERANCE_SEC;
  if (!verified) warnings.push(`The output is ${d.sec.toFixed(2)} s, not ${requested.toFixed(2)} s. It is not verified.`);
  return { kind: 'trim', bytes: re.bytes, mode: 're-encoded', durationSec: d.sec, requestedSec: requested, verified, width: d.width, height: d.height, rotate: req.rotate, rotation: d.rotation, warnings };
}

/** Segments are MPEG-TS. Try a copy remux to MP4; otherwise return the joined transport stream, labelled as such. */
async function remux(req: RemuxRequest): Promise<RemuxResult> {
  const blob = new Blob(req.segments);
  try {
    const input = new Input({ source: new BlobSource(blob), formats: [MPEG_TS] });
    try {
      const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
      const conv = await Conversion.init({ input, output, copy: { mode: 'forced' } });
      if (!conv.isValid || conv.discardedTracks.length > 0) throw new Error('Some tracks cannot be copied into MP4.');
      await conv.execute();
      const bytes = output.target.buffer;
      if (!bytes) throw new Error('No output was produced.');
      const d = await durationOf(bytes);
      return { kind: 'mp4', bytes, durationSec: d.sec, verified: Math.abs(d.sec - req.expectedSec) <= REMUX_TOLERANCE_SEC };
    } finally {
      input.dispose();
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return { kind: 'joined-ts', bytes: await blob.arrayBuffer(), reason };
  }
}

serve<WorkerRequest, WorkerResponse>(async (req, onProgress) => {
  if (req.type === 'trim') {
    const result = await trim(req, onProgress);
    return { result, transfer: [result.bytes] };
  }
  const result = await remux(req);
  return { result, transfer: [result.bytes] };
});
