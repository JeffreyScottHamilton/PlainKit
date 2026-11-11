/** Structured error every engine throws. message = what failed; nextAction = what the user can do. */
export class ToolError extends Error {
  constructor(
    public code: string,
    message: string,
    public nextAction?: string,
    public recoverable = true,
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

export function toToolError(e: unknown): ToolError {
  if (e instanceof ToolError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  return new ToolError('unexpected', msg || 'Something went wrong.', 'Try again, or try a different file.');
}
