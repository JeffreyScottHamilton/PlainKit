import { serve } from '@/workers/rpc';
import { exportFrames, probeFrames } from '@/engines/gif/pipeline';
import type { GifRequest, GifResult } from '@/engines/gif/types';

serve<GifRequest, GifResult>(async (req, onProgress) => {
  if (req.type === 'probe') {
    const result = await probeFrames(req.spec, onProgress);
    return { result, transfer: result.frames.map((f) => f.bitmap) };
  }
  const result = await exportFrames(req.spec, req.entries, req.options, onProgress);
  return { result, transfer: [result.bytes.buffer] };
});
