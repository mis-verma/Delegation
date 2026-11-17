import { describe, expect, it } from 'vitest';
import { findLabelClash, labelKey } from './labelKey';

const tags = [{ name: 'Networking' }, { name: 'Wi-Fi' }, { name: 'Urgent' }];

describe('label clash', () => {
  it('ignores case, spaces and punctuation', () => {
    expect(labelKey('Wi-Fi')).toBe(labelKey('wifi'));
    expect(labelKey('  Network  Issue ')).toBe(labelKey('network_issue'));
  });

  it('catches a label that is only spelled differently', () => {
    expect(findLabelClash(tags, 'wifi')?.name).toBe('Wi-Fi');
    expect(findLabelClash(tags, 'WI FI')?.name).toBe('Wi-Fi');
    expect(findLabelClash(tags, ' urgent ')?.name).toBe('Urgent');
  });

  it('lets a genuinely new label through', () => {
    expect(findLabelClash(tags, 'Network')).toBeUndefined();
    expect(findLabelClash(tags, 'Printer')).toBeUndefined();
  });

  it('never matches on an empty name', () => {
    expect(findLabelClash(tags, '   ')).toBeUndefined();
    expect(findLabelClash(tags, '!!!')).toBeUndefined();
  });
});
