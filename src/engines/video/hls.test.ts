import { describe, expect, it } from 'vitest';
import { HLS_MESSAGES, MAX_SEGMENTS, hostsOf, parseHls } from './hls';

const BASE = 'https://media.test/show/master.m3u8';

describe('parseHls master playlists', () => {
  it('lists variants with bandwidth and resolution, resolved against the playlist URL', () => {
    const text = [
      '#EXTM3U',
      '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360',
      '360/index.m3u8',
      '#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"',
      'https://cdn.media.test/720/index.m3u8',
    ].join('\n');
    const r = parseHls(text, BASE);
    expect(r).toEqual({
      ok: true,
      kind: 'master',
      variants: [
        { url: 'https://media.test/show/360/index.m3u8', bandwidth: 800000, resolution: { width: 640, height: 360 } },
        { url: 'https://cdn.media.test/720/index.m3u8', bandwidth: 2500000, resolution: { width: 1280, height: 720 } },
      ],
    });
  });

  it('rejects a variant that is not https', () => {
    const r = parseHls('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nhttp://media.test/a.m3u8', BASE);
    expect(r).toEqual({ ok: false, message: HLS_MESSAGES.httpsOnly });
  });
});

describe('parseHls media playlists', () => {
  it('resolves relative segment URLs and sums the VOD duration', () => {
    const text = [
      '#EXTM3U',
      '#EXT-X-TARGETDURATION:4',
      '#EXT-X-PLAYLIST-TYPE:VOD',
      '#EXTINF:2.000,',
      'seg0.ts',
      '#EXTINF:2.500,',
      '/abs/seg1.ts',
      '#EXTINF:1.500,',
      'https://other.test/seg2.ts',
      '#EXT-X-ENDLIST',
    ].join('\n');
    const r = parseHls(text, BASE);
    expect(r).toEqual({
      ok: true,
      kind: 'media',
      segments: [
        { url: 'https://media.test/show/seg0.ts', durationSec: 2 },
        { url: 'https://media.test/abs/seg1.ts', durationSec: 2.5 },
        { url: 'https://other.test/seg2.ts', durationSec: 1.5 },
      ],
      totalSec: 6,
    });
  });

  it('flags a live playlist (no ENDLIST) as unsupported', () => {
    const r = parseHls('#EXTM3U\n#EXTINF:2.0,\na.ts\n', BASE);
    expect(r).toEqual({ ok: false, message: 'Live streams are not supported' });
  });

  it('flags an encrypted playlist and does not look at the key', () => {
    const text = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="https://keys.test/k"\n#EXTINF:2.0,\na.ts\n#EXT-X-ENDLIST';
    expect(parseHls(text, BASE)).toEqual({ ok: false, message: HLS_MESSAGES.encrypted });
    const sample = '#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES\n#EXTINF:2.0,\na.ts\n#EXT-X-ENDLIST';
    expect(parseHls(sample, BASE)).toEqual({ ok: false, message: HLS_MESSAGES.encrypted });
  });

  it('accepts METHOD=NONE keys', () => {
    const text = '#EXTM3U\n#EXT-X-KEY:METHOD=NONE\n#EXTINF:2.0,\na.ts\n#EXT-X-ENDLIST';
    expect(parseHls(text, BASE).ok).toBe(true);
  });

  it('flags byte-range segments as unsupported', () => {
    const text = '#EXTM3U\n#EXTINF:2.0,\n#EXT-X-BYTERANGE:1000@0\na.ts\n#EXT-X-ENDLIST';
    expect(parseHls(text, BASE)).toEqual({ ok: false, message: 'Byte-range segments are not supported yet.' });
  });

  it('flags fragmented MP4 HLS (EXT-X-MAP) as unsupported', () => {
    const text = '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:2.0,\na.m4s\n#EXT-X-ENDLIST';
    expect(parseHls(text, BASE)).toEqual({ ok: false, message: HLS_MESSAGES.fmp4 });
  });

  it('errors above 2000 segments and accepts exactly 2000', () => {
    const make = (n: number) => ['#EXTM3U', ...Array.from({ length: n }, (_, i) => `#EXTINF:1.0,\ns${i}.ts`), '#EXT-X-ENDLIST'].join('\n');
    expect(MAX_SEGMENTS).toBe(2000);
    expect(parseHls(make(2000), BASE).ok).toBe(true);
    expect(parseHls(make(2001), BASE)).toEqual({ ok: false, message: HLS_MESSAGES.tooMany });
  });

  it('rejects text that is not a playlist', () => {
    expect(parseHls('<html></html>', BASE)).toEqual({ ok: false, message: HLS_MESSAGES.notHls });
  });
});

describe('parseHls request targets', () => {
  const base = 'https://media.example/v/index.m3u8';
  it('refuses links with credentials', () => {
    expect(parseHls('#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nhttps://user:pw@media.example/a.ts\n#EXT-X-ENDLIST\n', base).ok).toBe(false);
  });
  it('lists every host a playlist would contact, so it can be shown before downloading', () => {
    const r = parseHls('#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nseg/a.ts\n#EXTINF:4,\nhttps://cdn.other/b.ts\n#EXTINF:4,\nhttps://cdn.other/c.ts\n#EXT-X-ENDLIST\n', base);
    expect(r.ok && r.kind === 'media' ? hostsOf(r.segments.map((s) => s.url)) : null).toEqual(['media.example', 'cdn.other']);
  });
});
