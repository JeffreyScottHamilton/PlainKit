import { serve } from '@/workers/rpc';
import { runScan } from '@/engines/scan/process';
import type { ScanRequest, ScanResponse } from '@/engines/scan/types';

// One worker per call; terminated on cancel.
serve<ScanRequest, ScanResponse>(async (req, onProgress) => {
  onProgress({ stage: req.type === 'detect' ? 'inspecting' : 'processing' });
  const result = await runScan(req);
  if (result.kind === 'page') return { result, transfer: [result.bytes.buffer as ArrayBuffer] };
  return { result };
});
