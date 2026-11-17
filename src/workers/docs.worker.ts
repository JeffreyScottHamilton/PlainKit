import { serve } from '@/workers/rpc';
import { ToolError } from '@/lib/errors';
import { convertDocument, type DocRequest, type DocResult } from '@/engines/docs/convert';
import type { FontSet } from '@/engines/docs/pdf';

// Document conversion. The worker is created per job and terminated on cancel.
const FILES: Record<keyof FontSet, string> = { regular: 'NotoSans-Regular.ttf', bold: 'NotoSans-Bold.ttf', italic: 'NotoSans-Italic.ttf', boldItalic: 'NotoSans-BoldItalic.ttf' };

async function loadFonts(): Promise<FontSet> {
  const get = async (f: string): Promise<Uint8Array> => {
    const r = await fetch(`${import.meta.env.BASE_URL}fonts/doc/${f}`);
    if (!r.ok) throw new ToolError('fonts', 'The built-in fonts could not be loaded.', 'Reload the page and try again.');
    return new Uint8Array(await r.arrayBuffer());
  };
  const [regular, bold, italic, boldItalic] = await Promise.all([get(FILES.regular), get(FILES.bold), get(FILES.italic), get(FILES.boldItalic)]);
  return { regular: regular!, bold: bold!, italic: italic!, boldItalic: boldItalic! };
}

serve<DocRequest, DocResult>(async (req, onProgress) => {
  onProgress({ stage: 'processing', message: req.name });
  const result = await convertDocument(req, loadFonts);
  return { result };
});
