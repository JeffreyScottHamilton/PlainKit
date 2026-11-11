export const REGEX_DISPLAY_CAP = 500;

export type RegexRequest = { pattern: string; flags: string; text: string };
export type RegexMatch = { index: number; match: string; groups: (string | undefined)[]; named: Record<string, string | undefined> | null };
export type RegexResult = { count: number; matches: RegexMatch[]; truncated: boolean };
export type RegexCompile = { ok: true; flags: string } | { ok: false; message: string };

/** Compile-only check on the UI thread. Matching itself happens in the worker. */
export function compileRegex(pattern: string, flags: string): RegexCompile {
  if (pattern === '') return { ok: false, message: 'Enter a pattern.' };
  try {
    new RegExp(pattern, flags);
    return { ok: true, flags };
  } catch (e) {
    return { ok: false, message: `Invalid pattern: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Runs all matches. Forces the g flag so every match is found. Used inside regex.worker.ts. */
export function runRegex(req: RegexRequest): RegexResult {
  const flags = req.flags.includes('g') ? req.flags : req.flags + 'g';
  const re = new RegExp(req.pattern, flags);
  const matches: RegexMatch[] = [];
  let count = 0;
  for (const m of req.text.matchAll(re)) {
    count++;
    if (matches.length < REGEX_DISPLAY_CAP) {
      matches.push({
        index: m.index,
        match: m[0],
        groups: m.slice(1),
        named: m.groups ? { ...m.groups } : null,
      });
    }
  }
  return { count, matches, truncated: count > REGEX_DISPLAY_CAP };
}
