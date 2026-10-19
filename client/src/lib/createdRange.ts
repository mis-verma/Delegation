import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

const CREATED_FROM_PARAM = 'createdFrom';
const CREATED_TO_PARAM = 'createdTo';

export const createdRangeHref = (path: string, start: Date, end: Date) =>
  `${path}?${CREATED_FROM_PARAM}=${encodeURIComponent(start.toISOString())}&${CREATED_TO_PARAM}=${encodeURIComponent(end.toISOString())}`;

const DAY_FORMAT = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export interface CreatedRange {
  from: number;
  to: number;
  label: string;
}

const useUrlDateRange = (fromParam: string, toParam: string) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawFrom = searchParams.get(fromParam);
  const rawTo = searchParams.get(toParam);

  const range = useMemo<CreatedRange | null>(() => {
    if (!rawFrom || !rawTo) return null;
    const from = new Date(rawFrom).getTime();
    const to = new Date(rawTo).getTime();
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;
    const firstDay = DAY_FORMAT.format(new Date(from));
    const lastDay = DAY_FORMAT.format(new Date(to - 1));
    return { from, to, label: firstDay === lastDay ? firstDay : `${firstDay} to ${lastDay}` };
  }, [rawFrom, rawTo]);

  const matches = useCallback(
    (createdAt: string | Date) => {
      if (!range) return true;
      const t = new Date(createdAt).getTime();
      return t >= range.from && t < range.to;
    },
    [range],
  );

  const set = useCallback(
    (firstDay: Date, lastDay: Date) => {
      const start = new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate());
      const end = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate() + 1);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set(fromParam, start.toISOString());
          next.set(toParam, end.toISOString());
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams, fromParam, toParam],
  );

  const clear = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(fromParam);
        next.delete(toParam);
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams, fromParam, toParam]);

  return { range, matches, set, clear };
};

export const useCreatedRange = () => useUrlDateRange(CREATED_FROM_PARAM, CREATED_TO_PARAM);

export const useDueRange = () => useUrlDateRange('dueFrom', 'dueTo');
