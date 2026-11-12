import { ALL_FORMATS, BlobSource, BufferSource, BufferTarget, Conversion, Input, MPEG_TS, Mp4OutputFormat, Output, QUALITY_HIGH, WebMOutputFormat } from 'mediabunny';
import { serve } from '@/workers/rpc';
import { ToolError } from '@/lib/errors';
import type { JobProgress } from '@/jobs/types';
import { REMUX_TOLERANCE_SEC, TRIM_TOLERANCE_SEC, type WorkerRequest, type WorkerResponse, type TrimRequest, type RemuxRequest, type TrimResult, type RemuxResult } from './messages';

const encodeFailed = () => new ToolError('encode-failed', 'This browser could not write this video.', 'Try the other output format (WebM or MP4), or a different file.');

type Attempt = { bytes: ArrayBuffer; discarded: number } | null;

async function durationOf(bytes: ArrayBuffer): Promise<{ sec: number; width: number; height: number }> {
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  try {
    const sec = await input.computeDuration();
    const video = await input.getPrimaryVideoTrack();
    return { sec, width: video?.displayWidth ?? 0, height: video?.displayHeight ?? 0 };
  } finally {
    input.dispose();
  }
}

async function trim(req: TrimRequest, onProgress: (p: JobProgress) => void): Promise<TrimResult> {
  const requested = req.endSec - req.startSec;
  const warnings: string[] = [];
  const format = () => (req.format === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat());

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
        ...(copy ? {} : { video: { codec: req.videoCodec ?? undefined, quality: QUALITY_HIGH }, audio: req.audioCodec ? { codec: req.audioCodec, quality: QUALITY_HIGH } : { discard: true } }),
      });
      if (!conv.isValid) return null;
      if (copy && conv.discardedTracks.length > 0) return null;
      conv.onProgress = (p) => onProgress({ stage: 'processing', fraction: p, message: copy ? 'Copying without re-encoding' : 'Re-encoding' });
      await conv.execute();
      const buf = output.target.buffer;
      return buf ? { bytes: buf, discarded: conv.discardedTracks.length } : null;
    } finally {
      input.dispose();
    }
  };

  const copied = await attempt(true);
  if (copied) {
    const d = await durationOf(copied.bytes);
    if (Math.abs(d.sec - requested) <= TRIM_TOLERANCE_SEC) {
      return { kind: 'trim', bytes: copied.bytes, mode: 'copied', durationSec: d.sec, requestedSec: requested, verified: true, width: d.width, height: d.height, warnings };
    }
    warnings.push(`Copying without re-encoding gave ${d.sec.toFixed(2)} s, not ${requested.toFixed(2)} s (cut on a keyframe), so the video was re-encoded.`);
  } else {
    warnings.push('This trim cannot be copied without re-encoding in this format, so the video was re-encoded.');
  }

  if (!req.videoCodec) throw encodeFailed();
  if (!req.audioCodec) warnings.push('This browser cannot write audio in this format, so the output has no audio.');
  const re = await attempt(false);
  if (!re) throw encodeFailed();
  const d = await durationOf(re.bytes);
  const verified = Math.abs(d.sec - requested) <= TRIM_TOLERANCE_SEC;
  if (!verified) warnings.push(`The output is ${d.sec.toFixed(2)} s, not ${requested.toFixed(2)} s. It is not verified.`);
  return { kind: 'trim', bytes: re.bytes, mode: 're-encoded', durationSec: d.sec, requestedSec: requested, verified, width: d.width, height: d.height, warnings };
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
