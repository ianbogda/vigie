import { describe, expect, it } from 'vitest';
import { deltaRate, median, periodDate } from '../domain-utils';

describe('domain utilities', () => {
  it('parses supported accounting periods', () => {
    expect(periodDate('2026-09')?.getFullYear()).toBe(2026);
    expect(periodDate('09/2026')?.getMonth()).toBe(8);
    expect(periodDate('invalid')).toBeNull();
  });

  it('computes medians without mutating the source', () => {
    const values = [3, 1, 2, Number.NaN];
    expect(median(values)).toBe(2);
    expect(values.slice(0, 3)).toEqual([3, 1, 2]);
    expect(median([])).toBeNull();
  });

  it('computes relative changes and rejects a zero base', () => {
    expect(deltaRate(120, 100)).toBe(20);
    expect(deltaRate(80, 100)).toBe(-20);
    expect(deltaRate(80, 0)).toBeNull();
  });
});
