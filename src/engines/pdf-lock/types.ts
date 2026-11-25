// PDF object model used by this engine. Strings and stream data are raw bytes.

export type PdfName = { readonly kind: 'name'; readonly name: string };
export type PdfString = { readonly kind: 'string'; readonly bytes: Uint8Array };
export type PdfRef = { readonly kind: 'ref'; readonly num: number };
export type PdfDict = { readonly kind: 'dict'; readonly map: Map<string, PdfValue> };
export type PdfStream = { readonly kind: 'stream'; readonly dict: PdfDict; readonly data: Uint8Array };
export type PdfValue = null | boolean | number | PdfName | PdfString | PdfRef | PdfValue[] | PdfDict | PdfStream;

export const name = (n: string): PdfName => ({ kind: 'name', name: n });
export const str = (bytes: Uint8Array): PdfString => ({ kind: 'string', bytes });
export const ref = (num: number): PdfRef => ({ kind: 'ref', num });
export const dict = (entries: [string, PdfValue][] | Map<string, PdfValue> = []): PdfDict => ({
  kind: 'dict',
  map: new Map(entries),
});

export const isDict = (v: PdfValue | undefined): v is PdfDict => typeof v === 'object' && v !== null && !Array.isArray(v) && v.kind === 'dict';
export const isStream = (v: PdfValue | undefined): v is PdfStream => typeof v === 'object' && v !== null && !Array.isArray(v) && v.kind === 'stream';
export const isName = (v: PdfValue | undefined, n?: string): v is PdfName => typeof v === 'object' && v !== null && !Array.isArray(v) && v.kind === 'name' && (n === undefined || v.name === n);
export const isString = (v: PdfValue | undefined): v is PdfString => typeof v === 'object' && v !== null && !Array.isArray(v) && v.kind === 'string';
export const isRef = (v: PdfValue | undefined): v is PdfRef => typeof v === 'object' && v !== null && !Array.isArray(v) && v.kind === 'ref';
