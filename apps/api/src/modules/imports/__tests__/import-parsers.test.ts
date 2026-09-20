import { describe, expect, it } from 'vitest';
import { budgetSignal, budgetTrajectoryTarget, detectCsvType, isYgpie1Csv } from '../import-parsers.js';

describe('import parsers', () => {
  it('rejects unsupported CSV structures', () => {
    const input = Buffer.from('foo;bar\n1;2\n', 'utf8');
    expect(detectCsvType(input)).toBe('unknown');
    expect(isYgpie1Csv(input)).toBe(false);
  });

  it('computes a bounded budget trajectory', () => {
    expect(budgetTrajectoryTarget('2026-01-01')).toBeGreaterThanOrEqual(0);
    expect(budgetTrajectoryTarget('2026-12-31')).toBeLessThanOrEqual(1);
  });

  it('raises an alert when budget availability is negative', () => {
    const signal = budgetSignal({ budget: 1000, committed: 1100, accounted: 900, available: -100 }, '2026-09-20');
    expect(signal?.level).toBe('alert');
    expect(signal?.code).toBe('BUD-NEG');
  });
});
