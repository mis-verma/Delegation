import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { AgeFilter, QueueTab, QueueView, SortKey } from './verificationModel';

export interface QueueParams {
  view: QueueView;
  tab: QueueTab;
  sort: SortKey;
  q: string;
  store: string | null;
  dept: string | null;
  person: string | null;
  age: AgeFilter;
  attention: boolean;
  open: string | null;
}

export type QueueParamsPatch = Partial<QueueParams>;

const TABS: readonly QueueTab[] = ['all', 'checklists', 'tickets', 'delegations'];
const SORTS: readonly SortKey[] = ['oldest', 'overdue', 'compliance', 'newest'];
const AGES: readonly AgeFilter[] = ['any', '1', '3', '7'];

const DEFAULTS: QueueParams = {
  view: 'waiting', tab: 'all', sort: 'oldest', q: '', store: null, dept: null, person: null, age: 'any', attention: false, open: null,
};

const pick = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

const KEYS: Record<keyof QueueParams, string> = {
  view: 'view', tab: 'tab', sort: 'sort', q: 'q', store: 'store', dept: 'dept', person: 'person', age: 'age', attention: 'attn', open: 'open',
};

export const useQueueParams = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo<QueueParams>(() => ({
    view: searchParams.get('view') === 'decided' ? 'decided' : 'waiting',
    tab: pick(searchParams.get('tab'), TABS, 'all'),
    sort: pick(searchParams.get('sort'), SORTS, 'oldest'),
    q: searchParams.get('q') ?? '',
    store: searchParams.get('store'),
    dept: searchParams.get('dept'),
    person: searchParams.get('person'),
    age: pick(searchParams.get('age'), AGES, 'any'),
    attention: searchParams.get('attn') === '1',
    open: searchParams.get('open'),
  }), [searchParams]);

  const patch = useCallback((change: QueueParamsPatch, options: { replace?: boolean } = {}) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const key of Object.keys(change) as (keyof QueueParams)[]) {
        const value = change[key];
        const isDefault = value === null || value === undefined || value === false || value === DEFAULTS[key];
        if (isDefault) next.delete(KEYS[key]);
        else next.set(KEYS[key], value === true ? '1' : String(value));
      }
      return next;
    }, { replace: options.replace ?? true });
  }, [setSearchParams]);

  return { params, patch, searchParams };
};
