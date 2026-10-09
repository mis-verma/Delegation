import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { DateRangeValue } from '../../../components';
import type { GroupBy } from './GroupByControl';
import { defaultWindow, parseDateParam, toDateParam } from './analyticsDisplay';
import { endOfDay } from '../../../lib/dateRange';

// Week, because the page opens on this month (below): a month cut by month would be a single bar.
export const DEFAULT_GROUP_BY: GroupBy = 'week';

const parseGroupBy = (value: string | null): GroupBy =>
  value === 'day' || value === 'week' || value === 'month' || value === 'year' ? value : DEFAULT_GROUP_BY;

// The page keeps its time window and open tab in the address (?by=week&from=2026-10-01&to=2026-10-14
// &tab=tickets), so a refresh or a shared link lands on the same view. This returns one stable
// updater that merges into whatever the address holds at call time, which keeps callbacks handed to
// memoised children from changing identity on every URL change.
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

// Today's date as a string that changes at local midnight (and when a sleeping tab wakes up), so
// anything keyed on it recomputes once the day rolls over.
const useToday = () => {
  const [today, setToday] = useState(() => toDateParam(new Date()));
  useEffect(() => {
    const refresh = () => setToday(toDateParam(new Date()));
    const now = new Date();
    const untilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
    const timer = window.setTimeout(refresh, untilMidnight + 1000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [today]);
  return today;
};

/**
 * The time window an analytics page shows, kept in the address (?by=week&from=2026-10-01&to=...), so
 * the Overview and the full Rankings page read, change and share exactly the same one.
 */
export const useAnalyticsWindow = () => {
  const [params] = useSearchParams();
  const patch = useSearchPatch();

  const groupBy = parseGroupBy(params.get('by'));
  const fromParam = params.get('from');
  const toParam = params.get('to');

  // `today` moves at midnight, so a tab left open overnight does not keep showing yesterday's window.
  const today = useToday();
  // ?range=all is "no range picked": the last twelve buckets of the grouping. Without it and without a
  // picked from/to, the page opens on this month, so its winners and totals are about now, not the year.
  const showAll = params.get('range') === 'all';

  // A range only counts once BOTH ends are real dates. The picker reports {from, to: null} after
  // its first tap, which must never reach a query (a start with no end silently runs to "now").
  const range = useMemo<DateRangeValue>(() => {
    const from = parseDateParam(fromParam);
    const to = parseDateParam(toParam);
    if (from && to && from.getTime() <= to.getTime()) return { from, to };
    if (showAll) return { from: null, to: null };
    const now = parseDateParam(today) ?? new Date();
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth(), now.getDate()) };
  }, [fromParam, toParam, showAll, today]);

  // range.to is a calendar date at local midnight (the picker is not in showTime mode), so wrap it
  // to the end of that day or the last day would be dropped from the query.
  const from = useMemo(() => range.from?.toISOString(), [range]);
  const to = useMemo(() => (range.to ? endOfDay(range.to).toISOString() : undefined), [range]);

  // The ONE window the ranking sections (leaders, leaderboard, stores table) share: the picked
  // range, or else the last 12 buckets of the grouping (30 days for Day), the same span the control
  // bar names. Without it ticket and delegation figures were all-time while store checklists were
  // the last 30 days.
  // Year grouping would ask for twelve years, which the checklist reports refuse (366 days at most),
  // so the ranking window for it is the last twelve months.
  const fallbackWindow = useMemo(() => defaultWindow(groupBy === 'year' ? 'month' : groupBy, parseDateParam(today) ?? undefined), [groupBy, today]);
  const windowFrom = from ?? fallbackWindow.from;
  const windowTo = to ?? fallbackWindow.to;

  const handleGroupBy = useCallback((next: GroupBy) => patch({ by: next === DEFAULT_GROUP_BY ? null : next }), [patch]);
  const handleRange = useCallback(
    // Clearing the range (tapping the lit chip again) asks for the long view explicitly; otherwise the page
    // would fall straight back to its this-month default and the chip could never be turned off.
    (next: DateRangeValue) => patch(next.from && next.to
      ? { from: toDateParam(next.from), to: toDateParam(next.to), range: null }
      : { from: null, to: null, range: 'all' }),
    [patch],
  );

  return { params, patch, groupBy, range, from, to, windowFrom, windowTo, handleGroupBy, handleRange };
};
