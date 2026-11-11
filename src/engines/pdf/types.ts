import type { ExportResult } from './export';
import type { PageRef } from './model';

/** Worker request: source blobs are structured-cloned (references), so the session originals are never transferred. */
export type ExportRequest = { type: 'export'; pages: PageRef[]; sources: { id: string; blob: Blob }[] };
export type WorkerRequest = ExportRequest;
export type WorkerResponse = ExportResult;
