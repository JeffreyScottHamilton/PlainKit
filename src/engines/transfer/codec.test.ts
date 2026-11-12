import { describe, expect, it } from 'vitest';
import { CODE_PREFIX, decodeCode, encodeCode, type CodePayload } from './codec';

const SDP = [
  'v=0',
  'o=- 1 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF',
  'a=candidate:1 1 udp 2122260223 192.168.0.2 54321 typ host',
  '',
].join('\r\n');

const offer: CodePayload = { v: 1, type: 'offer', sdp: SDP };
const answer: CodePayload = { v: 1, type: 'answer', sdp: SDP };

describe('invite and reply codes', () => {
  it('round-trips an offer and an answer', async () => {
    const code = await encodeCode(offer);
    expect(code.startsWith(CODE_PREFIX)).toBe(true);
    expect(await decodeCode(code, 'offer')).toEqual(offer);
    expect(await decodeCode(await encodeCode(answer), 'answer')).toEqual(answer);
  });

  it('ignores whitespace and line breaks pasted into the box', async () => {
    const code = await encodeCode(offer);
    const spaced = `  ${code.slice(0, 20)}\n ${code.slice(20)}  `;
    expect(await decodeCode(spaced, 'offer')).toEqual(offer);
  });

  it('rejects an empty paste', async () => {
    await expect(decodeCode('   ', 'offer')).rejects.toMatchObject({ code: 'code-empty' });
  });

  it('rejects garbage and a wrong prefix with a clear code', async () => {
    await expect(decodeCode('hello world', 'offer')).rejects.toMatchObject({ code: 'code-prefix' });
    const code = await encodeCode(offer);
    await expect(decodeCode('pk9.' + code.slice(CODE_PREFIX.length), 'offer')).rejects.toMatchObject({ code: 'code-prefix' });
  });

  it('rejects characters outside base64url', async () => {
    await expect(decodeCode('pk1.abc$def', 'offer')).rejects.toMatchObject({ code: 'code-corrupt' });
  });

  it('rejects a tampered payload through the checksum', async () => {
    const code = await encodeCode(offer);
    const i = Math.floor(code.length / 2);
    const swapped = code[i] === 'A' ? 'B' : 'A';
    const tampered = code.slice(0, i) + swapped + code.slice(i + 1);
    await expect(decodeCode(tampered, 'offer')).rejects.toMatchObject({ code: 'code-corrupt' });
  });

  it('rejects a reply pasted where an invite is expected, and the reverse', async () => {
    await expect(decodeCode(await encodeCode(answer), 'offer')).rejects.toMatchObject({ code: 'code-type' });
    await expect(decodeCode(await encodeCode(offer), 'answer')).rejects.toMatchObject({ code: 'code-type' });
  });

  it('rejects a well-formed code whose payload is not a valid pairing payload', async () => {
    const bad = await encodeCode({ v: 1, type: 'offer', sdp: 'not an sdp' });
    await expect(decodeCode(bad, 'offer')).rejects.toMatchObject({ code: 'code-shape' });
  });
});
