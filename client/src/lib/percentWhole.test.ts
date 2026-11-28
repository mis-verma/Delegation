import { describe, expect, it } from 'vitest';
import { formatWholePct, wholePct } from './percent';

describe('wholePct', () => {
  it('rounds to whole numbers', () => {
    expect(wholePct(85.7)).toBe(86);
    expect(wholePct(85.4)).toBe(85);
    expect(formatWholePct(85.7)).toBe('86%');
  });

  it('keeps 100 and 0 only for exact values', () => {
    expect(wholePct(99.6)).toBe(99);
    expect(wholePct(100)).toBe(100);
    expect(wholePct(0.4)).toBe(1);
    expect(wholePct(0)).toBe(0);
  });

  it('returns the fallback for missing values', () => {
    expect(wholePct(null)).toBeNull();
    expect(formatWholePct(undefined)).toBe('-');
  });
});
