import { describe, expect, it } from 'vitest';
import { assText, readHead, readMkvSubtitles } from './mkv';
import { mkvFixtureBytes } from './mkv.fixture';

const fixture = () => new Blob([mkvFixtureBytes() as BlobPart]);

describe('mkv subtitles', () => {
  it('reads element headers', () => {
    expect(readHead(Uint8Array.of(0x1a, 0x45, 0xdf, 0xa3, 0x82, 1, 2), 0)).toEqual({ id: 0x1a45dfa3, size: 2, headLen: 5, unknown: false });
    expect(readHead(Uint8Array.of(0xe7, 0xff), 0)?.unknown).toBe(true);
  });
  it('lists subtitle tracks and marks picture-based ones as not text', async () => {
    const r = await readMkvSubtitles(fixture());
    expect(r.tracks.map((t) => [t.number, t.codec, t.language, t.text])).toEqual([[2, 'S_TEXT/UTF8', 'eng', true], [3, 'S_TEXT/ASS', 'jpn', true], [4, 'S_HDMV/PGS', 'fre', false]]);
    expect(r.tracks[0]!.name).toBe('English');
    expect(r.cues.has(4)).toBe(false);
  });
  it('extracts cues with exact times, Unicode, and ASS text without styling', async () => {
    const r = await readMkvSubtitles(fixture());
    expect(r.cues.get(2)).toEqual([
      { start: 1500, end: 3000, text: 'Hello, world.' },
      { start: 5000, end: 5800, text: 'No duration here' }, // provisional 2 s cut at the next cue
      { start: 5800, end: 7800, text: 'Next 🎬' },
    ]);
    expect(r.cues.get(3)).toEqual([{ start: 1500, end: 3000, text: 'こんにちは\n世界' }]);
  });
  it('reports scan progress and honours cancel', async () => {
    const seen: number[] = [];
    await readMkvSubtitles(fixture(), { onProgress: (f) => seen.push(f) });
    expect(seen[seen.length - 1]).toBe(1);
    const ctl = new AbortController();
    ctl.abort();
    await expect(readMkvSubtitles(fixture(), { signal: ctl.signal })).rejects.toThrow(/Canceled/);
  });
  it('rejects files that are not Matroska', async () => {
    await expect(readMkvSubtitles(new Blob(['\0\0\0 ftypisom']))).rejects.toThrow(/not a Matroska or WebM file/);
  });
  it('strips ASS fields and override tags', () => {
    expect(assText('3,0,Default,Name,0,0,0,,{\\i1}Hi{\\i0} there\\Nline two, with comma')).toBe('Hi there\nline two, with comma');
  });
});
