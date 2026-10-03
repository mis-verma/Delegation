import type { CompliancePeriod } from './dashboardDisplay';

// The previous period is always complete while the current one is only partly over, so comparing
// a half-finished week with a whole one reads as a drop that is not real. Until this much of the
// current period has gone by, no change badge is shown at all.
export const TREND_MIN_ELAPSED = 0.5;

/** Share (0 to 1) of the period [start, end) that has gone by at `now`. */
export const periodElapsedFraction = (start: number, end: number, now: number): number => {
  if (!(end > start)) return 1;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
};

/** True once enough of the current period has passed for a change vs the last one to be fair. */
export const isTrendReady = (start: number, end: number, now: number): boolean =>
  periodElapsedFraction(start, end, now) >= TREND_MIN_ELAPSED;

/** Tooltip wording for a delta against the period before this one. */
export const PERIOD_COMPARE_TITLE: Record<CompliancePeriod, string> = {
  day: 'vs yesterday',
  week: 'vs last week',
  month: 'vs last month',
  year: 'vs last year',
};
