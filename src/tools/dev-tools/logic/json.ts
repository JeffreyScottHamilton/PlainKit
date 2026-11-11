export type JsonIndent = 'minify' | '2' | '4' | 'tab';
export type JsonOutcome = { ok: true; text: string } | { ok: false; message: string };

export function positionToLineCol(src: string, pos: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  const end = Math.min(pos, src.length);
  for (let i = 0; i < end; i++) {
    if (src[i] === '\n') {
      line++;
      column = 1;
    } else column++;
  }
  return { line, column };
}

/** Explains a JSON.parse failure with line/column when the engine reports a position. */
export function describeJsonError(err: unknown, src: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  const explicit = /line (\d+) column (\d+)/i.exec(msg);
  if (explicit) return `Invalid JSON at line ${explicit[1]}, column ${explicit[2]}: ${msg}`;
  const pos = /position (\d+)/i.exec(msg);
  if (pos) {
    const { line, column } = positionToLineCol(src, Number(pos[1]));
    return `Invalid JSON at line ${line}, column ${column}: ${msg}`;
  }
  if (/end of JSON input/i.test(msg)) {
    const { line, column } = positionToLineCol(src, src.length);
    return `Invalid JSON: input ends early at line ${line}, column ${column}. A bracket, brace, or string is probably not closed.`;
  }
  return `Invalid JSON (the parser gave no position): ${msg}`;
}

function sortKeysDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      // defineProperty so a key named "__proto__" stays an ordinary own property
      Object.defineProperty(out, k, { value: sortKeysDeep((v as Record<string, unknown>)[k]), enumerable: true, writable: true, configurable: true });
    }
    return out;
  }
  return v;
}

export function formatJson(src: string, indent: JsonIndent, sortKeys: boolean): JsonOutcome {
  if (src.trim() === '') return { ok: false, message: 'Paste some JSON first.' };
  let value: unknown;
  try {
    value = JSON.parse(src);
  } catch (e) {
    return { ok: false, message: describeJsonError(e, src) };
  }
  if (sortKeys) value = sortKeysDeep(value);
  const space = indent === 'minify' ? undefined : indent === 'tab' ? '\t' : Number(indent);
  return { ok: true, text: JSON.stringify(value, null, space) };
}
