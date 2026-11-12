import type { Region } from './model';

export type RenderFormat = 'image/png' | 'image/jpeg';
export type RenderOutput = { blob: Blob; mime: RenderFormat; width: number; height: number };

export type RedactRequest = { type: 'render'; blob: Blob; regions: Region[]; format: RenderFormat };
export type RedactResponse = { kind: 'render'; value: RenderOutput };
