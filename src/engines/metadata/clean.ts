import { stripMetadata, type StripOptions } from './strip';
import { verifyClean, type Verdict } from './verify';

const verdicts = new WeakMap<Blob, Verdict>();

/** Verdict recorded for a cleaned output blob (WeakMap: released with the asset). */
export function verdictOf(blob: Blob): Verdict | undefined {
  return verdicts.get(blob);
}

/** Strips a file and verifies the output by re-reading it. The input bytes are not modified. */
export async function cleanFile(input: Blob, mime: string, opts: StripOptions): Promise<{ blob: Blob; verdict: Verdict }> {
  const out = stripMetadata(new Uint8Array(await input.arrayBuffer()), opts);
  const verdict = await verifyClean(out);
  const blob = new Blob([out as BlobPart], { type: mime });
  verdicts.set(blob, verdict);
  return { blob, verdict };
}
