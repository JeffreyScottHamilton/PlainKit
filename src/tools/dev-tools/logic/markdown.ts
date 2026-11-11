import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Images and embeds are dropped so previewing a document never fetches remote resources.
const FORBID_TAGS = ['img', 'picture', 'source', 'video', 'audio', 'iframe', 'object', 'embed', 'link', 'style', 'form', 'input', 'button', 'textarea', 'select', 'svg', 'math'];

export function renderMarkdownRaw(src: string): string {
  return marked.parse(src, { async: false, gfm: true });
}

/** Fails closed: throws instead of returning unsanitized HTML when DOMPurify cannot run. */
export function sanitizeMarkdown(src: string): string {
  if (!DOMPurify.isSupported) throw new Error('The HTML sanitizer is unavailable in this browser, so the preview is disabled.');
  return DOMPurify.sanitize(renderMarkdownRaw(src), { FORBID_TAGS, FORBID_ATTR: ['style'] });
}
