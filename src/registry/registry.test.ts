import { describe, expect, it } from 'vitest';
import { TOOLS, TOOL_GROUPS, searchTools, toolsFor, HOME_DIRECTORY, getTool } from './index';

describe('registry', () => {
  it('has the tools in the agreed order', () => {
    expect(TOOLS.map((t) => t.name)).toEqual(['Compress', 'Resize', 'Convert', 'Cutout', 'Color palette', 'Metadata', 'Redact', 'ID photo',
      'Video', 'Recorder', 'GIF maker', 'Audio stems', 'Subtitles', 'PDF', 'Sign PDF', 'CSV', 'Clean text', 'Clean links', 'Dev tools', 'QR code',
      'Send files', 'Zip', 'Keep awake']);
    expect(new Set(TOOLS.map((t) => t.id)).size).toBe(23);
  });
  it('puts every tool in exactly one sidebar group, in TOOLS order', () => {
    expect(TOOL_GROUPS.flatMap((g) => g.ids)).toEqual(TOOLS.map((t) => t.id));
    expect(TOOL_GROUPS.map((g) => g.label)).toEqual(['Images', 'Video & audio', 'Documents & data', 'Text & code', 'Share & device']);
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
    expect(toolsFor('application/pdf').map((t) => t.id)).toEqual(['compress', 'convert', 'pdf', 'send-files']);
    expect(toolsFor('image/heic').map((t) => t.id)).toEqual(['convert', 'send-files']);
  });
  it('home directory points at real tools', () => {
    HOME_DIRECTORY.flat().forEach((id) => expect(getTool(id)).toBeDefined());
  });
});
