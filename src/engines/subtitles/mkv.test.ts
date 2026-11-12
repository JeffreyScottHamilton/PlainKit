import { describe, expect, it } from 'vitest';
import { assText, readHead, readMkvSubtitles } from './mkv';

// Minimal EBML writer for fixtures.
const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const idBytes = (id: number) => {
  const b: number[] = [];
  for (let v = id; v > 0; v = Math.floor(v / 256)) b.unshift(v % 256);
  return Uint8Array.from(b);
};
const size = (n: number) => (n < 127 ? Uint8Array.of(0x80 | n) : Uint8Array.of(0x10 | (n >>> 24), (n >>> 16) & 255, (n >>> 8) & 255, n & 255));
const el = (id: number, ...data: Uint8Array[]) => {
  const d = cat(...data);
  return cat(idBytes(id), size(d.length), d);
};
const u = (n: number) => (n < 256 ? Uint8Array.of(n) : n < 65536 ? Uint8Array.of(n >> 8, n & 255) : Uint8Array.of((n >>> 16) & 255, (n >>> 8) & 255, n & 255));
const s = (t: string) => new TextEncoder().encode(t);
const block = (track: number, rel: number, text: string) => cat(Uint8Array.of(0x80 | track, (rel >> 8) & 255, rel & 255, 0), s(text));
const track = (n: number, type: number, codec: string, lang = 'eng', name = '') => el(0xae, el(0xd7, u(n)), el(0x83, u(type)), el(0x86, s(codec)), el(0x22b59c, s(lang)), ...(name ? [el(0x536e, s(name))] : []));

function fixture() {
  const tracks = el(0x1654ae6b, track(1, 1, 'V_VP8'), track(2, 0x11, 'S_TEXT/UTF8', 'eng', 'English'), track(3, 0x11, 'S_TEXT/ASS', 'jpn'), track(4, 0x11, 'S_HDMV/PGS', 'fre'));
  const c1 = el(0x1f43b675, el(0xe7, u(1000)),
    el(0xa3, block(1, 0, 'VIDEOFRAME')),
    el(0xa0, el(0xa1, block(2, 500, 'Hello, world.')), el(0x9b, u(1500))),
    el(0xa0, el(0xa1, block(3, 500, '0,0,Default,,0,0,0,,{\\an8}こんにちは\\N世界')), el(0x9b, u(1500))),
    el(0xa0, el(0xa1, block(4, 0, 'PGSBITMAP')), el(0x9b, u(1000))));
  const c2 = el(0x1f43b675, el(0xe7, u(5000)), el(0xa3, block(2, 0, 'No duration here')), el(0xa3, block(2, 800, 'Next 🎬')));
  const seg = el(0x18538067, el(0x1549a966, el(0x2ad7b1, u(1000000))), tracks, c1, c2);
  return new Blob([cat(el(0x1a45dfa3, el(0x4282, s('matroska'))), seg) as BlobPart]);
}

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
