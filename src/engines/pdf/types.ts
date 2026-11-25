import type { ExportResult } from './export';
import type { PageRef } from './model';
import type { NumberStyle } from './numbering';

/**
 * Worker request: source blobs are structured-cloned (references), so the session originals are never transferred.
 * Each part becomes one output PDF, in order.
 */
export type ExportRequest = { type: 'export'; parts: PageRef[][]; numbering: NumberStyle; sources: { id: string; blob: Blob }[] };
export type WorkerRequest = ExportRequest;
export type WorkerResponse = ExportResult[];
