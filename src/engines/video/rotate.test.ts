import { describe, expect, it } from 'vitest';
import { expectedRotation, rotatedSuffix, turnOf, TURN_OPTIONS } from './rotate';

describe('turnOf', () => {
  it('maps each option to its clockwise degrees', () => {
    expect(TURN_OPTIONS.map((o) => turnOf(o.value))).toEqual([0, 90, 180, 270]);
  });
});

describe('expectedRotation', () => {
  it('adds the clockwise turn to the source rotation', () => {
    expect(expectedRotation(0, 90)).toBe(90);
    expect(expectedRotation(0, 270)).toBe(270);
    expect(expectedRotation(0, 0)).toBe(0);
  });
  it('wraps modulo 360', () => {
    expect(expectedRotation(270, 180)).toBe(90);
    expect(expectedRotation(90, 270)).toBe(0);
    expect(expectedRotation(180, 180)).toBe(0);
  });
});

describe('rotatedSuffix', () => {
  it('leaves the base name when no turn is applied', () => {
    expect(rotatedSuffix('trimmed', 0)).toBe('trimmed');
    expect(rotatedSuffix('muted', 0)).toBe('muted');
  });
  it('names the turn when one is applied', () => {
    expect(rotatedSuffix('trimmed', 90)).toBe('trimmed-rotated-90');
    expect(rotatedSuffix('muted', 270)).toBe('muted-rotated-270');
  });
});
