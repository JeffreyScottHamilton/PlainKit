import { describe, expect, it } from 'vitest';
import { TARGET_PRESETS, targetBytesFrom } from './logic';

describe('target size presets', () => {
  it('each preset is a valid target that converts to its byte size', () => {
    expect(TARGET_PRESETS.map((p) => p.label)).toEqual(['500 KB', '1 MB', '2 MB']);
    expect(TARGET_PRESETS.map((p) => targetBytesFrom(p.value, p.unit))).toEqual([512_000, 1_048_576, 2_097_152]);
  });
});
