import { describe, expect, it } from 'vitest';
import { formatPctFixed, pctDigits } from './percent';

describe('one-decimal scores', () => {
  it('always shows one decimal so a column lines up', () => {
    expect(formatPctFixed(80)).toBe('80.0%');
    expect(formatPctFixed(82.5)).toBe('82.5%');
    expect(pctDigits(79.96)).toBe('80.0');
  });

  it('keeps the edges honest and the fallback for no data', () => {
    expect(formatPctFixed(99.97)).toBe('99.9%');
    expect(formatPctFixed(0.04)).toBe('0.1%');
    expect(formatPctFixed(null)).toBe('-');
    expect(pctDigits(undefined)).toBeNull();
  });
});
