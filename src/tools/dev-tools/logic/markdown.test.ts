import { describe, expect, it } from 'vitest';
import { sanitizeMarkdown } from './markdown';

describe('markdown', () => {
  it('renders Markdown to HTML', () => {
    expect(sanitizeMarkdown('# Title')).toContain('<h1>Title</h1>');
  });
  it('removes script tags, event handler attributes and javascript: links', () => {
    const out = sanitizeMarkdown('Hi <script>alert(1)</script> <img src="https://x.test/a.png" onerror="alert(1)"> [x](javascript:alert(1)) <div onclick="alert(2)">ok</div>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('<img');
    expect(out).toContain('ok');
  });
});
