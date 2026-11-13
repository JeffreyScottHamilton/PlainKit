// Test-only: builds Matroska bytes by hand. Not imported by the app.
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

/** A small Matroska file: one video track, an SRT-style track, an ASS track and a picture-based track. */
export function mkvFixtureBytes(): Uint8Array {
  const tracks = el(0x1654ae6b, track(1, 1, 'V_VP8'), track(2, 0x11, 'S_TEXT/UTF8', 'eng', 'English'), track(3, 0x11, 'S_TEXT/ASS', 'jpn'), track(4, 0x11, 'S_HDMV/PGS', 'fre'));
  const c1 = el(0x1f43b675, el(0xe7, u(1000)),
    el(0xa3, block(1, 0, 'VIDEOFRAME')),
    el(0xa0, el(0xa1, block(2, 500, 'Hello, world.')), el(0x9b, u(1500))),
    el(0xa0, el(0xa1, block(3, 500, '0,0,Default,,0,0,0,,{\\an8}こんにちは\\N世界')), el(0x9b, u(1500))),
    el(0xa0, el(0xa1, block(4, 0, 'PGSBITMAP')), el(0x9b, u(1000))));
  const c2 = el(0x1f43b675, el(0xe7, u(5000)), el(0xa3, block(2, 0, 'No duration here')), el(0xa3, block(2, 800, 'Next 🎬')));
  const seg = el(0x18538067, el(0x1549a966, el(0x2ad7b1, u(1000000))), tracks, c1, c2);
  return cat(el(0x1a45dfa3, el(0x4282, s('matroska'))), seg);
}


/** Like a live recording: clusters are written without a size, so each runs until the next top-level element. */
export function mkvLiveFixtureBytes(): Uint8Array {
  const open = (id: number, ...data: Uint8Array[]) => cat(idBytes(id), Uint8Array.of(0xff), ...data);
  const tracks = el(0x1654ae6b, track(2, 0x11, 'S_TEXT/UTF8', 'eng'));
  const c1 = open(0x1f43b675, el(0xe7, u(0)), el(0xa0, el(0xa1, block(2, 100, 'First')), el(0x9b, u(900))));
  const c2 = open(0x1f43b675, el(0xe7, u(4000)), el(0xa0, el(0xa1, block(2, 0, 'Second')), el(0x9b, u(1000))));
  const seg = cat(idBytes(0x18538067), Uint8Array.of(0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff), el(0x1549a966, el(0x2ad7b1, u(1000000))), tracks, c1, c2);
  return cat(el(0x1a45dfa3, el(0x4282, s('webm'))), seg);
}
