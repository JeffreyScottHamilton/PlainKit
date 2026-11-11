import { describe, expect, it } from 'vitest';
import { inspectPdf, hasPdfSignature } from './load';
import { encryptedPdf, makePdf } from './fixtures';
import { ToolError } from '@/lib/errors';

async function errorOf(p: Promise<unknown>): Promise<ToolError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ToolError);
    return e as ToolError;
  }
  throw new Error('expected a ToolError');
}

describe('inspectPdf', () => {
  it('reports page count, sizes and rotation', async () => {
    const bytes = await makePdf([{ width: 200 }, { width: 301, height: 500, rotate: 90 }]);
    const info = await inspectPdf(bytes);
    expect(info.pageCount).toBe(2);
    expect(info.pages[0]).toEqual({ width: 200, height: 300, rotation: 0 });
    expect(info.pages[1]).toEqual({ width: 301, height: 500, rotation: 90 });
  });

  it('refuses password-protected files with the encrypted error', async () => {
    const err = await errorOf(inspectPdf(encryptedPdf()));
    expect(err.code).toBe('encrypted');
    expect(err.message).toBe('This PDF is password-protected.');
    expect(err.nextAction).toBe('Remove the password in a PDF reader first, then try again.');
  });

  it('refuses corrupt bytes, including random data and truncated PDFs', async () => {
    const random = new Uint8Array(4096).map((_, i) => (i * 7919) & 0xff);
    for (const bytes of [random, new TextEncoder().encode('hello world'), new Uint8Array(0)]) {
      const err = await errorOf(inspectPdf(bytes));
      expect(err.code).toBe('corrupt');
      expect(err.message).toBe('This file could not be read as a PDF.');
    }
    const good = await makePdf([{ width: 200 }, { width: 201 }]);
    const err = await errorOf(inspectPdf(good.slice(0, 40)));
    expect(err.code).toBe('corrupt');
  });

  it('checks the %PDF- signature before parsing', () => {
    expect(hasPdfSignature(new TextEncoder().encode('%PDF-1.7 rest'))).toBe(true);
    expect(hasPdfSignature(new TextEncoder().encode('junk\n%PDF-1.4'))).toBe(true);
    expect(hasPdfSignature(new TextEncoder().encode('PK\u0003\u0004 zip'))).toBe(false);
  });
});
