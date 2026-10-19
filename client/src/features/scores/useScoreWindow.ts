import { useMemo } from 'react';
import { defaultWindow, parseDateParam, toDateParam } from '../admin/analytics/analyticsDisplay';
import { useAnalyticsWindow } from '../admin/analytics/useAnalyticsWindow';
import { useOrgToday } from '../checklist/useOrgToday';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const dayLabel = (day: string): string => {
  const [y, m, d] = day.split('-').map(Number);
  return `${d} ${MONTHS[m - 1] ?? ''} ${y}`;
};

export const windowLabel = (from: string, to: string): string => (from === to ? dayLabel(from) : `${dayLabel(from)} to ${dayLabel(to)}`);

export const capWindowAtToday = (from: string, to: string, today: string) => {
  const cappedTo = to > today ? today : to;
  const cappedFrom = from > cappedTo ? cappedTo : from;
  return { from: cappedFrom, to: cappedTo, capped: cappedTo !== to };
};

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
