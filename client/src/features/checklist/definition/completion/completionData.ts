import type { ChecklistInstance } from '../../../../api/checklistInstances';
import { percentOf } from './completionBands';

export interface CompletionPoint {
  key: string;
  label: string;
  percent: number;
  done: number;
  total: number;
  runs: number;
}

type Bucket = { label: string; done: number; total: number; runs: number; sortBy: number };

const itemCounts = (instance: ChecklistInstance) => ({
  done: instance.items.filter((item) => item.isDone).length,
  total: instance.items.length,
});

const collect = (
  instances: readonly ChecklistInstance[],
  keyOf: (instance: ChecklistInstance) => string | null,
  labelOf: (instance: ChecklistInstance, key: string) => string,
  sortOf: (instance: ChecklistInstance) => number,
): CompletionPoint[] => {
  const buckets = new Map<string, Bucket>();
  for (const instance of instances) {
    const key = keyOf(instance);
    if (key === null) continue;
    const { done, total } = itemCounts(instance);
    const bucket = buckets.get(key) ?? { label: labelOf(instance, key), done: 0, total: 0, runs: 0, sortBy: sortOf(instance) };
    bucket.done += done;
    bucket.total += total;
    bucket.runs += 1;
    bucket.sortBy = Math.max(bucket.sortBy, sortOf(instance));
    buckets.set(key, bucket);
  }
  return [...buckets].map(([key, bucket]) => ({
    key,
    label: bucket.label,
    percent: percentOf(bucket.done, bucket.total),
    done: bucket.done,
    total: bucket.total,
    runs: bucket.runs,
  }));
};

const dayKey = (iso: string) => iso.slice(0, 10);

const DAY_LABEL = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

export const completionByStore = (
  instances: readonly ChecklistInstance[],
  storeNameById: ReadonlyMap<string, string> | null,
): CompletionPoint[] =>
  collect(
    instances,
    (instance) => instance.storeId ?? null,
    (instance) => (instance.storeId && storeNameById?.get(instance.storeId)) || 'Unknown store',
    () => 0,
  ).sort((a, b) => a.percent - b.percent || a.label.localeCompare(b.label));

export const completionByPeriod = (instances: readonly ChecklistInstance[], limit = 14): CompletionPoint[] => {
  const points = collect(
    instances,
    (instance) => dayKey(instance.periodStart),
    (instance) => DAY_LABEL.format(new Date(instance.periodStart)),
    (instance) => new Date(instance.periodStart).getTime(),
  ).sort((a, b) => a.key.localeCompare(b.key));
  return points.slice(-limit);
};

export const overallCompletion = (instances: readonly ChecklistInstance[]): CompletionPoint => {
  let done = 0;
  let total = 0;
  for (const instance of instances) {
    const counts = itemCounts(instance);
    done += counts.done;
    total += counts.total;
  }
  return { key: 'all', label: 'All runs', percent: percentOf(done, total), done, total, runs: instances.length };
};
