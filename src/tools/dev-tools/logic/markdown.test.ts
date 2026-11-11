// Sanitizer behavior (script/onerror/javascript: removal) is verified in real Chromium:
// happy-dom mangles DOMPurify's tree walk, so these tests cover the pipeline guard only.
import DOMPurify from 'dompurify';
import { describe, expect, it } from 'vitest';
import { renderMarkdownRaw, sanitizeMarkdown } from './markdown';

describe('markdown', () => {
  it('renders Markdown to HTML before sanitizing', () => {
    expect(renderMarkdownRaw('# Title')).toContain('<h1>Title</h1>');
  });
  it('refuses to produce HTML when the sanitizer is unavailable', () => {
    const supported = DOMPurify.isSupported;
    try {
      (DOMPurify as { isSupported: boolean }).isSupported = false;
      expect(() => sanitizeMarkdown('# x')).toThrow(/sanitizer is unavailable/);
    } finally {
      (DOMPurify as { isSupported: boolean }).isSupported = supported;
    }
  });
});
