---
name: plainkit-local-processing
description: Browser-local file processing for Plainkit — workers, typed messaging, cancellation, memory-aware queue, buffer and object-URL ownership. Use when writing engines, workers, the job queue, or the session file tray.
metadata: {origin: project-authored, revision: 1}
---
# Local processing, workers, memory (project-authored)

- Heavy work runs in a worker. Main thread only orchestrates and renders.
- Messages are a typed discriminated union shared by both sides (`run`, `cancel`, `progress`, `done`, `error`). No `any`, no JSON-serialising Blobs — use structured clone; transfer buffers only when the sender no longer needs them.
- Originals are immutable. Read from `asset.blob` per job; never transfer the sole copy.
- Cancellation: `AbortSignal` end to end. Cooperative checks between steps; if an engine cannot stop, terminate and recreate the worker and discard its temp state. Cancel must leave the tool retryable without duplicating the input or losing edits.
- Queue: queued ≠ running. One heavy job at a time by default; light jobs may run concurrently. Estimate cost from pixel count / byte size; refuse or warn above caps rather than crash.
- Defensive parsing: validate signatures not extensions; cap image dimensions and decompressed sizes; catch decode failures as structured `ToolError`s.
- Images: honour EXIF orientation (`createImageBitmap(..., {imageOrientation:'from-image'})`), `OffscreenCanvas.convertToBlob`, then verify the actual output MIME and magic bytes — browsers silently fall back to PNG for unsupported encoders.
- Release: `bitmap.close()`, revoke object URLs on unmount/removal/clear, drop buffer references, terminate idle heavy workers.
- Progress: report `fraction` only when genuinely known.
- Stream large inputs where the format allows; use bounded previews (e.g. first N CSV rows).

Tests required per engine: success, corrupted input, cancel mid-run, retry after failure, original bytes unchanged (hash before/after).
