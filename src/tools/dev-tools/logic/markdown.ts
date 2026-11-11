import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Images and embeds are dropped so previewing a document never fetches remote resources.
const FORBID_TAGS = ['img', 'picture', 'source', 'video', 'audio', 'iframe', 'object', 'embed', 'link', 'style', 'form', 'input', 'button', 'textarea', 'select', 'svg', 'math'];

export function sanitizeMarkdown(src: string): string {
  const raw = marked.parse(src, { async: false, gfm: true }) as string;
  return DOMPurify.sanitize(raw, { FORBID_TAGS, FORBID_ATTR: ['style'], ALLOW_UNKNOWN_PROTOCOLS: false });
}
