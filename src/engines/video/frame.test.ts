import { describe, expect, it } from 'vitest';
import { frameFileName } from './frame';

describe('frameFileName', () => {
  it('builds a safe PNG name from the source name and the timecode', () => {
    expect(frameFileName('clip.mp4', 83.456)).toBe('clip-frame-01-23-456.png');
  });
  it('starts at zero and strips path characters from the source name', () => {
    expect(frameFileName('a/b:c.webm', 0)).toBe('a_b_c-frame-00-00-000.png');
  });
});
