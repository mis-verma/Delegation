import { describe, expect, it } from 'vitest';
import { bandOf, percentOf } from './completionBands';
import { completionByPeriod, completionByStore, overallCompletion } from './completionData';
import type { ChecklistInstance } from '../../../../api/checklistInstances';

const run = (id: string, storeId: string | null, periodStart: string, done: number, total: number): ChecklistInstance =>
  ({
    id,
    storeId,
    periodStart,
    items: Array.from({ length: total }, (_, i) => ({ isDone: i < done })),
  }) as unknown as ChecklistInstance;

const stores = new Map([['s1', 'Solan'], ['s2', 'Rohru']]);

describe('completion bands', () => {
  it('splits at 40 and 80, on the boundary itself', () => {
    expect(bandOf(0)).toBe('low');
    expect(bandOf(39)).toBe('low');
    expect(bandOf(40)).toBe('mid');
    expect(bandOf(79)).toBe('mid');
    expect(bandOf(80)).toBe('high');
    expect(bandOf(100)).toBe('high');
  });

  it('calls an empty checklist nought, never a divide by zero', () => {
    expect(percentOf(0, 0)).toBe(0);
    expect(percentOf(1, 3)).toBe(33);
  });
});

describe('completion by store', () => {
  const runs = [
    run('a', 's1', '2026-03-01', 8, 10),
    run('b', 's1', '2026-03-02', 8, 10),
    run('c', 's2', '2026-03-01', 1, 10),
  ];

  it('adds up every run a store did, not an average of averages', () => {
    const byStore = completionByStore(runs, stores);
    expect(byStore.map((p) => [p.label, p.percent, p.runs])).toEqual([['Rohru', 10, 1], ['Solan', 80, 2]]);
  });

  it('puts the store that needs help first', () => {
    expect(completionByStore(runs, stores)[0]!.label).toBe('Rohru');
  });

  it('copes with an unknown or missing store', () => {
    expect(completionByStore([run('d', 's9', '2026-03-01', 1, 2)], stores)[0]!.label).toBe('Unknown store');
    expect(completionByStore([run('e', null, '2026-03-01', 1, 2)], stores)).toEqual([]);
  });
});

describe('completion over time', () => {
  it('groups runs by day, oldest first', () => {
    const points = completionByPeriod([
      run('a', 's1', '2026-03-02T00:00:00Z', 5, 10),
      run('b', 's1', '2026-03-01T00:00:00Z', 10, 10),
      run('c', 's2', '2026-03-02T00:00:00Z', 5, 10),
    ]);
    expect(points.map((p) => [p.key, p.percent])).toEqual([['2026-03-01', 100], ['2026-03-02', 50]]);
  });

  it('keeps only the most recent days', () => {
    const many = Array.from({ length: 20 }, (_, i) => run(`r${i}`, 's1', `2026-03-${String(i + 1).padStart(2, '0')}`, 1, 1));
    const points = completionByPeriod(many, 5);
    expect(points).toHaveLength(5);
    expect(points[points.length - 1]!.key).toBe('2026-03-20');
  });

  it('has nothing to draw with no runs', () => {
    expect(completionByPeriod([])).toEqual([]);
    expect(completionByStore([], stores)).toEqual([]);
    expect(overallCompletion([])).toMatchObject({ percent: 0, runs: 0 });
  });
});
