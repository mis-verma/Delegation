import { describe, expect, it } from 'vitest';
import { MAX_HOLD_MS, shouldKeepHolding } from './settleHold';
import { findJustDone } from './useDoneLast';

const item = (id: string, done: boolean) => ({ id, done });
const isDone = (i: { done: boolean }) => i.done;

describe('settle hold', () => {
  it('waits while the person is still working in that row', () => {
    expect(shouldKeepHolding(1_000, 1_400, true)).toBe(true);
  });

  it('lets go the moment they are done with it', () => {
    expect(shouldKeepHolding(1_000, 1_400, false)).toBe(false);
  });

  it('never holds for ever, even if the row keeps the focus', () => {
    expect(shouldKeepHolding(0, MAX_HOLD_MS, true)).toBe(false);
    expect(shouldKeepHolding(0, MAX_HOLD_MS + 1, true)).toBe(false);
    expect(shouldKeepHolding(0, MAX_HOLD_MS - 1, true)).toBe(true);
  });
});

describe('spotting what was just answered', () => {
  const before = new Map([['a', false], ['b', true]]);

  it('reports only the ones that flipped to done', () => {
    expect(findJustDone(before, [item('a', true), item('b', true)], isDone)).toEqual(['a']);
  });

  it('says nothing when nothing changed', () => {
    expect(findJustDone(before, [item('a', false), item('b', true)], isDone)).toEqual([]);
  });

  it('ignores a question it has never seen before', () => {
    expect(findJustDone(before, [item('c', true)], isDone)).toEqual([]);
  });
});
