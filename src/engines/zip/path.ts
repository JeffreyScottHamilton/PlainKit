/** Turns an archive or user path into a safe relative display path. Returns '' when nothing usable remains. */
export function sanitizePath(raw: string): string {
  const parts = raw
    .replace(/\\/g, '/')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/^[A-Za-z]:/, '')
    .split('/')
    .filter((p) => p !== '' && p !== '.' && p !== '..');
  return parts.join('/');
}

export const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/** Makes every path unique by adding " (2)", " (3)" before the extension. Keeps input order. */
export function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  return paths.map((p) => {
    if (!seen.has(p)) {
      seen.add(p);
      return p;
    }
    const dot = p.lastIndexOf('.');
    const hasExt = dot > p.lastIndexOf('/') + 1;
    const stem = hasExt ? p.slice(0, dot) : p;
    const ext = hasExt ? p.slice(dot) : '';
    for (let n = 2; ; n++) {
      const cand = `${stem} (${n})${ext}`;
      if (!seen.has(cand)) {
        seen.add(cand);
        return cand;
      }
    }
  });
}
