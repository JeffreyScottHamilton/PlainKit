import { describe, expect, it } from 'vitest';
import type { MetadataReport } from './read';
import { removalSummary, removalText } from './summary';

const report = (over: Partial<MetadataReport> = {}): MetadataReport => ({
  format: 'image/jpeg',
  cleanable: true,
  hasLocation: false,
  present: [],
  groups: [],
  ...over,
});
const group = (title: string, fields: [string, string][]) => ({ title, fields: fields.map(([name, value]) => ({ name, value })) });

describe('removalSummary', () => {
  it('reports no GPS, no camera and no date for a bare file', () => {
    const s = removalSummary(report());
    expect(s).toEqual({ gps: false, camera: null, date: null });
    expect(removalText(s)).toBe('Removed from this file: GPS location no · Camera none found · Date none found');
  });

  it('reports GPS, make and model, and the capture date', () => {
    const s = removalSummary(
      report({
        hasLocation: true,
        groups: [group('Camera', [['Make', 'Canon'], ['Model', 'EOS R5']]), group('Date and time', [['DateTimeOriginal', '2024-05-01T10:00:00.000Z']])],
      }),
    );
    expect(s).toEqual({ gps: true, camera: 'Canon EOS R5', date: '2024-05-01T10:00:00.000Z' });
  });

  it('does not repeat the make when the model already starts with it', () => {
    const s = removalSummary(report({ groups: [group('Camera', [['Make', 'NIKON'], ['Model', 'Nikon Z6']])] }));
    expect(s.camera).toBe('Nikon Z6');
  });

  it('falls back to the date fields in order', () => {
    const s = removalSummary(report({ groups: [group('Date and time', [['CreateDate', '2023-01-02']])] }));
    expect(s.date).toBe('2023-01-02');
  });
});
