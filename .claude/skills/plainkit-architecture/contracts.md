# Contracts

```ts
type SessionAsset = { id: string; name: string; mime: string; size: number; blob: Blob;
  origin: 'imported' | 'generated'; parentIds: string[]; createdAt: number };
type JobProgress = { stage: 'loading-engine' | 'inspecting' | 'processing' | 'exporting';
  fraction?: number /* 0..1 only when genuinely known */; message?: string };
type ToolResult = { assets: SessionAsset[]; warnings: string[] };
type Engine<O> = (input: { assets: SessionAsset[]; options: O; signal: AbortSignal;
  onProgress: (p: JobProgress) => void }) => Promise<ToolResult>;
type ToolError = { code: string; message: string; nextAction?: string; recoverable: boolean };
```

File-tool states: idle, input-selected, inspecting, ready, engine-downloading, processing, complete, canceled, failed, unsupported. Queued is distinct from running. Engine download progress is distinct from processing progress.

Ownership: the session owns asset blobs and preview object URLs; whoever creates an object URL revokes it. Transferring an ArrayBuffer detaches it — copy or re-read from the Blob, never transfer the only copy of an original. Non-cooperative engines are cancelled by terminating and recreating the worker.

Clear session: cancel jobs, revoke URLs, drop references, clear opted-in persistence. Engine/model caches are a separate control. Sessions are tab-scoped.
