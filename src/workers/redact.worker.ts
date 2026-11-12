import { serve } from '@/workers/rpc';
import { renderRedacted } from '@/engines/redact/render';
import type { RedactRequest, RedactResponse } from '@/engines/redact/types';

// Redaction render only. The worker is created per job and terminated on cancel.
serve<RedactRequest, RedactResponse>(async (req) => {
  const value = await renderRedacted(req.blob, req.regions, req.format);
  return { result: { kind: 'render', value } };
});
