import { useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { DateRangeValue } from '../../../components';
import type { GroupBy } from './GroupByControl';
import { defaultWindow, parseDateParam, toDateParam } from './analyticsDisplay';
import { endOfDay } from '../../../lib/dateRange';
import { useOrgToday } from '../../checklist/useOrgToday';

const DEFAULT_GROUP_BY: GroupBy = 'week';

const parseGroupBy = (value: string | null): GroupBy =>
  value === 'day' || value === 'week' || value === 'month' || value === 'year' ? value : DEFAULT_GROUP_BY;

export const useSearchPatch = () => {
  const navigate = useNavigate();
  return useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(window.location.search);
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === '') next.delete(key);
        else next.set(key, value);
      }
      const search = next.toString();
      navigate({ search: search ? `?${search}` : '' }, { replace: true, preventScrollReset: true });
    },
    [navigate],
  );
};

export const useAnalyticsWindow = () => {
  const [params] = useSearchParams();
  const patch = useSearchPatch();

  const groupBy = parseGroupBy(params.get('by'));
  const fromParam = params.get('from');
  const toParam = params.get('to');

  const today = useOrgToday();
  const showAll = params.get('range') === 'all';

  const range = useMemo<DateRangeValue>(() => {
    const from = parseDateParam(fromParam);
    const to = parseDateParam(toParam);
    if (from && to && from.getTime() <= to.getTime()) return { from, to };
    if (showAll) return { from: null, to: null };
    const now = parseDateParam(today) ?? new Date();
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth(), now.getDate()) };
  }, [fromParam, toParam, showAll, today]);

  const from = useMemo(() => range.from?.toISOString(), [range]);
  const to = useMemo(() => (range.to ? endOfDay(range.to).toISOString() : undefined), [range]);

  const fallbackWindow = useMemo(() => defaultWindow(groupBy === 'year' ? 'month' : groupBy, parseDateParam(today) ?? undefined), [groupBy, today]);
  const windowFrom = from ?? fallbackWindow.from;
  const windowTo = to ?? fallbackWindow.to;

  const handleGroupBy = useCallback((next: GroupBy) => patch({ by: next === DEFAULT_GROUP_BY ? null : next }), [patch]);
  const handleRange = useCallback(
    (next: DateRangeValue) => patch(next.from && next.to
      ? { from: toDateParam(next.from), to: toDateParam(next.to), range: null }
      : { from: null, to: null, range: 'all' }),
    [patch],
  );

  return { params, patch, groupBy, range, from, to, windowFrom, windowTo, handleGroupBy, handleRange };
};
