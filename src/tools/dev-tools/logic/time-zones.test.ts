import { describe, expect, it } from 'vitest';
import { formatZone, wallToInstant } from './time-zones';

describe('time zones', () => {
  it('converts a wall time across the New York DST boundary', () => {
    const before = wallToInstant({ y: 2025, mo: 3, d: 8, h: 12, mi: 0 }, 'America/New_York');
    const after = wallToInstant({ y: 2025, mo: 3, d: 9, h: 12, mi: 0 }, 'America/New_York');
    expect(before).toEqual({ ms: Date.UTC(2025, 2, 8, 17), exists: true });
    expect(after).toEqual({ ms: Date.UTC(2025, 2, 9, 16), exists: true });
  });

  it('flags a wall time skipped by the New York spring-forward gap', () => {
    const gap = wallToInstant({ y: 2025, mo: 3, d: 9, h: 2, mi: 30 }, 'America/New_York');
    expect(gap.exists).toBe(false);
  });

  it('converts London in summer (BST) and winter (GMT), and flags its spring gap', () => {
    expect(wallToInstant({ y: 2025, mo: 7, d: 1, h: 12, mi: 0 }, 'Europe/London').ms).toBe(Date.UTC(2025, 6, 1, 11));
    expect(wallToInstant({ y: 2025, mo: 1, d: 1, h: 12, mi: 0 }, 'Europe/London').ms).toBe(Date.UTC(2025, 0, 1, 12));
    expect(wallToInstant({ y: 2025, mo: 3, d: 30, h: 1, mi: 30 }, 'Europe/London').exists).toBe(false);
  });

  it('formats the wall time and a long UTC offset', () => {
    expect(formatZone(Date.UTC(2025, 2, 9, 16), 'America/New_York')).toEqual({ wall: '2025-03-09 12:00', offset: 'GMT-04:00' });
    expect(formatZone(Date.UTC(2025, 0, 1, 0), 'UTC').offset).toBe('GMT+00:00');
  });
});
