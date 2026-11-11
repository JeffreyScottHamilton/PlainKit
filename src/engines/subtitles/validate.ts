import type { Cue, Issue } from './model';

export const LONG_CUE_MS = 20000;

/** Errors block export. Warnings and info never do. Overlap is only a warning: it is sometimes intentional. */
export function validate(cues: Cue[]): Issue[] {
  const out: Issue[] = [];
  cues.forEach((c, i) => {
    const n = i + 1;
    if (c.start < 0 || c.end < 0) {
      out.push({ index: i, severity: 'error', message: `Cue ${n} has a negative time. Times must be 0 or more.` });
    } else if (c.end <= c.start) {
      out.push({ index: i, severity: 'error', message: `Cue ${n} ends at or before it starts. End must be after start.` });
    }
    if (c.text.split('\n').some((l) => l.trim() === '') && c.text !== '') {
      out.push({ index: i, severity: 'error', message: `Cue ${n} has an empty line. An empty line ends a cue in the file, so the export would break it.` });
    }
    const next = cues[i + 1];
    if (next && c.end > next.start) {
      out.push({ index: i, severity: 'warning', message: `Cue ${n} overlaps cue ${n + 1} by ${c.end - next.start} ms. Overlap is sometimes intentional.` });
    }
    if (c.end - c.start > LONG_CUE_MS) {
      out.push({ index: i, severity: 'info', message: `Cue ${n} lasts ${((c.end - c.start) / 1000).toFixed(1)} s. Cues over 20 s are hard to follow.` });
    }
    const lines = c.text.split('\n').length;
    if (lines > 2) out.push({ index: i, severity: 'info', message: `Cue ${n} has ${lines} lines. More than 2 lines is hard to read.` });
  });
  return out;
}

export const countBySeverity = (issues: Issue[]) => ({
  error: issues.filter((i) => i.severity === 'error').length,
  warning: issues.filter((i) => i.severity === 'warning').length,
  info: issues.filter((i) => i.severity === 'info').length,
});
