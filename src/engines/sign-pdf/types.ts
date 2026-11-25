// Placed items live in display points (top-left origin) on a page. Sent to the worker as-is.

export type ItemBase = { id: string; page: number; x: number; y: number };
export type MarkItem = ItemBase & { kind: 'image'; label: 'Signature' | 'Initials'; w: number; h: number; blob: Blob };
export type TextItem = ItemBase & { kind: 'text' | 'date'; size: number; text: string };
export type VectorItem = ItemBase & { kind: 'check' | 'cross'; size: number };
export type Item = MarkItem | TextItem | VectorItem;

/** A saved signature or initials: a PNG with transparency, plus its pixel size. */
export type Mark = { blob: Blob; w: number; h: number };

export type ExportResult = { bytes: Uint8Array; pageCount: number; dropped: number };
export type WorkerRequest = { type: 'export'; source: Blob; items: Item[] };
export type WorkerResponse = ExportResult;
