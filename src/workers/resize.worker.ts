import { serve } from '@/workers/rpc';
import { renderResize } from '@/engines/resize/render';
import type { RenderResult, ResizeRequest } from '@/engines/resize/types';

// One worker per job; terminated on cancel.
serve<ResizeRequest, RenderResult>(async (req, onProgress) => {
  onProgress({ stage: 'processing' });
  return { result: await renderResize(req.blob, req.settings) };
});
