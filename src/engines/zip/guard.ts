import { ToolError } from '@/lib/errors';
import { formatBytes } from '@/lib/format';

/** Largest total uncompressed size we will inflate. Guards against zip bombs and tab memory limits. */
export const MAX_TOTAL_BYTES = 2 * 1024 ** 3;

export function assertWithinCap(total: number, what: string, cap = MAX_TOTAL_BYTES): void {
  if (total > cap) {
    throw new ToolError(
      'zip-too-large',
      `${what} is ${formatBytes(total)}, over the ${formatBytes(cap)} limit.`,
      'Select fewer files, or split the work into smaller ZIPs.',
    );
  }
}
