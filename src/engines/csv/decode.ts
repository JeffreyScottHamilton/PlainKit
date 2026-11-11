import { ToolError } from '@/lib/errors';

export const ENCODINGS = ['auto', 'utf-8', 'utf-16le', 'utf-16be', 'windows-1252', 'iso-8859-1'] as const;
export type EncodingChoice = (typeof ENCODINGS)[number];

export const ENCODING_LABEL: Record<EncodingChoice, string> = {
  auto: 'Auto',
  'utf-8': 'UTF-8',
  'utf-16le': 'UTF-16LE',
  'utf-16be': 'UTF-16BE',
  'windows-1252': 'Windows-1252',
  'iso-8859-1': 'ISO-8859-1',
};

export type Decoded = { text: string; encoding: string; bom: boolean };

export const MAX_BYTES = 200 * 1024 * 1024;
export const WARN_BYTES = 50 * 1024 * 1024;

/** Refuse files over the limit before anything is read into memory. */
export function assertSize(size: number): void {
  if (size > MAX_BYTES)
    throw new ToolError('too-large', `This file is ${Math.round(size / 1048576)} MB. The limit is 200 MB.`, 'Split the file into smaller parts and load each one.', false);
}

type Codec = 'utf-8' | 'utf-16le' | 'utf-16be';
function bomOf(b: Uint8Array): Codec | null {
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return 'utf-8';
  if (b[0] === 0xff && b[1] === 0xfe) return 'utf-16le';
  if (b[0] === 0xfe && b[1] === 0xff) return 'utf-16be';
  return null;
}
function isUtf8(b: Uint8Array): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(b);
    return true;
  } catch {
    return false;
  }
}

/** Decode file bytes. Auto: BOM, then strict UTF-8, then Windows-1252. A leading BOM is always stripped and reported. */
export function decodeBytes(bytes: Uint8Array, choice: EncodingChoice): Decoded {
  const bomKind = bomOf(bytes);
  let enc: string;
  let codec: Codec | 'windows-1252' | 'iso-8859-1';
  if (choice === 'auto') {
    if (bomKind) {
      codec = bomKind;
      enc = `${ENCODING_LABEL[bomKind]} (byte order mark)`;
    } else if (isUtf8(bytes)) {
      codec = 'utf-8';
      enc = 'UTF-8 (detected)';
    } else {
      codec = 'windows-1252';
      enc = 'Windows-1252 (fallback: not valid UTF-8)';
    }
  } else {
    codec = choice;
    enc = ENCODING_LABEL[choice];
  }
  const text = codec === 'iso-8859-1' ? latin1(bytes) : new TextDecoder(codec).decode(bytes);
  const bom = bomKind !== null && (choice === 'auto' || choice === bomKind);
  return { text: text.charCodeAt(0) === 0xfeff ? text.slice(1) : text, encoding: enc, bom };
}

/** ISO-8859-1 maps each byte to the code point of the same value (WHATWG would map it to Windows-1252). */
function latin1(bytes: Uint8Array): string {
  let out = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return out;
}
