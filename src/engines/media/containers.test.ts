import { describe as d, expect, it } from 'vitest';
import { CONTAINERS, containerById, describe, targetHeight } from './containers';

d('media containers', () => {
  it('has unique ids and extensions', () => {
    expect(new Set(CONTAINERS.map((c) => c.id)).size).toBe(CONTAINERS.length);
    expect(containerById('m4a').mime).toBe('audio/mp4');
  });
  it('never upscales and keeps heights even', () => {
    expect(targetHeight(1080, 720)).toBe(720);
    expect(targetHeight(480, 720)).toBeUndefined();
    expect(targetHeight(1080, 0)).toBeUndefined();
    expect(targetHeight(1081, 481)).toBe(480);
  });
  it('describes tracks', () => {
    expect(describe({ durationSec: 2, video: { codec: 'vp8', width: 320, height: 240, canDecode: true }, audio: null })).toBe('2.0 s · 320×240 vp8');
  });
});
