import { useMemo } from 'react';
import { defaultWindow, parseDateParam, toDateParam } from '../admin/analytics/analyticsDisplay';
import { useAnalyticsWindow } from '../admin/analytics/useAnalyticsWindow';
import { useOrgToday } from '../checklist/useOrgToday';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-10-01' -> '1 Oct 2026'. */
const dayLabel = (day: string): string => {
  const [y, m, d] = day.split('-').map(Number);
  return `${d} ${MONTHS[m - 1] ?? ''} ${y}`;
};

/** '1 Oct 2026' or '1 Oct 2026 to 14 Oct 2026'. */
export const windowLabel = (from: string, to: string): string => (from === to ? dayLabel(from) : `${dayLabel(from)} to ${dayLabel(to)}`);

/**
 * Caps a window at today, the way the server does: a later day has nothing due yet, so asking for it
 * only splits the cache. Both the Scores page and every card that shows the same people read their
 * window through this, so one person and one period always ask for the same numbers.
 */
export const capWindowAtToday = (from: string, to: string, today: string) => {
  const cappedTo = to > today ? today : to;
  const cappedFrom = from > cappedTo ? cappedTo : from;
  return { from: cappedFrom, to: cappedTo, capped: cappedTo !== to };
};

/**
 * THE window for score pages: the picked dates from the address (?from=&to=, the same params the Overview and
 * Scorecard keep), else month to date. `?range=all` means the long view (last twelve weeks). Always org days
 * (YYYY-MM-DD), never later than today.
 */
export const useScoreWindow = () => {
  const { range, handleRange, patch } = useAnalyticsWindow();
  const today = useOrgToday();

  const win = useMemo(() => {
    let from: string;
    let to: string;
    if (range.from && range.to) {
      from = toDateParam(range.from);
      to = toDateParam(range.to);
    } else {
      const fallback = defaultWindow('week', parseDateParam(today) ?? undefined);
      from = toDateParam(new Date(fallback.from));
      to = toDateParam(new Date(fallback.to));
    }
    const capped = capWindowAtToday(from, to, today);
    return { ...capped, requestedTo: to, label: windowLabel(capped.from, capped.to) };
  }, [range, today]);

  return { ...win, today, range, handleRange, patch };
};
