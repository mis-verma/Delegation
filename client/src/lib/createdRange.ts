import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

// "Only items created between these two moments" as two URL params, so a chart bar can link straight
// to a list page narrowed to that bar's period, and the link works when shared or reloaded.
export const CREATED_FROM_PARAM = 'createdFrom';
export const CREATED_TO_PARAM = 'createdTo';

/** `/tasks` plus the params for [start, end). */
export const createdRangeHref = (path: string, start: Date, end: Date) =>
  `${path}?${CREATED_FROM_PARAM}=${encodeURIComponent(start.toISOString())}&${CREATED_TO_PARAM}=${encodeURIComponent(end.toISOString())}`;

const DAY_FORMAT = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export interface CreatedRange {
  /** Inclusive start, exclusive end, in ms. */
  from: number;
  to: number;
  /** "6 Oct 2026" for one day, "6 Oct 2026 to 12 Oct 2026" for more. */
  label: string;
}

/**
 * The created-between filter from the URL, or null when there is none (or it is malformed, in which
 * case it is ignored rather than showing an empty list). `matches` is the list filter, `clear` drops
 * the two params and keeps every other one.
 */
export const useCreatedRange = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawFrom = searchParams.get(CREATED_FROM_PARAM);
  const rawTo = searchParams.get(CREATED_TO_PARAM);

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

  const clear = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(CREATED_FROM_PARAM);
        next.delete(CREATED_TO_PARAM);
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  return { range, matches, clear };
};
