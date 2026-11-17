import { serve } from '@/workers/rpc';
import { decodeToRgba } from '@/engines/palette/decode';
import { extractPalette } from '@/engines/palette/extract';
import type { PaletteRequest, PaletteResponse } from '@/engines/palette/types';

// The preview copy is shown for picking; analysis reads a further 256 px copy of it.
const PREVIEW_MAX = 512;
const ANALYSIS_MAX = 256;

serve<PaletteRequest, PaletteResponse>(async (req) => {
  const preview = await decodeToRgba(req.blob, PREVIEW_MAX);
  const colors = extractPalette(preview, req.k, ANALYSIS_MAX);
  return { result: { kind: 'analyze', colors, preview }, transfer: [preview.data.buffer as ArrayBuffer] };
});
