import { serve } from '@/workers/rpc';
import { renderWatermark } from '@/engines/watermark/render';
import type { RenderResult, WatermarkRequest } from '@/engines/watermark/types';

// One worker per job; terminated on cancel.
serve<WatermarkRequest, RenderResult>(async (req, onProgress) => {
  onProgress({ stage: 'processing' });
  return { result: await renderWatermark(req.blob, req.logo, req.settings) };
});
