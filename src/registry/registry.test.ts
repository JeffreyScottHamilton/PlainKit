import { describe, expect, it } from 'vitest';
import { TOOLS, searchTools, toolsFor, HOME_DIRECTORY, getTool } from './index';

describe('registry', () => {
  it('has exactly the 17 tools in the agreed order', () => {
    expect(TOOLS.map((t) => t.name)).toEqual(['Compress', 'Convert', 'Cutout', 'Dev tools', 'Metadata', 'Clean links', 'Send files', 'Redact', 'PDF',
      'Audio stems', 'Subtitles', 'QR code', 'CSV', 'ID photo', 'Clean text', 'Video', 'Keep awake']);
    expect(new Set(TOOLS.map((t) => t.id)).size).toBe(17);
  });
  it('never includes gift cards', () => {
    expect(searchTools('gift')).toEqual([]);
    expect(searchTools('cardtally')).toEqual([]);
  });
  it('finds tools by old reference name and by task', () => {
    expect(searchTools('shrinkray')[0]?.id).toBe('compress');
    expect(searchTools('MergePDF')[0]?.id).toBe('pdf');
    expect(searchTools('utm')[0]?.id).toBe('clean-links');
  });
  it('offers only genuinely compatible tools for a file', () => {
    const img = toolsFor('image/png').map((t) => t.id);
    expect(img).toEqual(expect.arrayContaining(['compress', 'convert', 'redact', 'cutout']));
    expect(img).not.toContain('pdf');
    expect(toolsFor('application/pdf').map((t) => t.id)).toEqual(['pdf', 'send-files']);
  });
  it('home directory points at real tools', () => {
    HOME_DIRECTORY.flat().forEach((id) => expect(getTool(id)).toBeDefined());
  });
});
