import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { scoreApi, type ScoreReport, type ScoreReportRow, type ScoreScope } from '../../api/scores';
import { useAuth } from '../../context/AuthContext';
import { handleQueryRetry } from '../../lib/queryHelpers';

// Scores are aggregates over a period, not a live feed: a minute-old answer is fresh, and switching
// back to the tab is no reason to recompute them. Retry skips 4xx, which no retry can fix.
export const SCORE_QUERY_OPTIONS = {
  staleTime: 60_000,
  refetchOnWindowFocus: false,
  retry: handleQueryRetry,
} as const;

/** One person, department, store or the whole organisation. `from`/`to` are org days (YYYY-MM-DD). */
export const scoreQuery = (scope: ScoreScope, id: string | undefined, from: string, to: string) => ({
  queryKey: ['scores', scope, id ?? 'me', from, to] as const,
  queryFn: () => scoreApi.get({ scope, id, from, to }),
  ...SCORE_QUERY_OPTIONS,
});

/**
 * Every department and person the viewer may see for one window. ONE key for every view that reads it
 * (Scorecard, Overview leaders and leaderboard, rankings, the card's ranking and export), so they share
 * one request and can never show two different answers for the same window.
 */
const scoreReportQuery = (from: string, to: string) => ({
  queryKey: ['scores', 'report', from, to] as const,
  queryFn: (): Promise<ScoreReport> => scoreApi.report({ from, to }),
  ...SCORE_QUERY_OPTIONS,
});

/** Every store for one window (Admin and PC), fetched on its own so it never refetches the people. */
const storeScoreReportQuery = (from: string, to: string) => ({
  queryKey: ['scores', 'report-stores', from, to] as const,
  queryFn: (): Promise<ScoreReportRow[]> => scoreApi.report({ from, to, stores: 'only' }).then((r) => r.stores),
  ...SCORE_QUERY_OPTIONS,
});

/** Store, department and employee counts for the Overview's organisation tiles (Admin and PC): four small aggregates, not the roster. */
export const useOrgCounts = (enabled = true) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['scores', 'org-counts'] as const,
    queryFn: () => scoreApi.orgCounts(),
    enabled: enabled && !!token,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: handleQueryRetry,
  });
};

export const useScoreReport = (from: string | undefined, to: string | undefined, enabled = true) => {
  const { token } = useAuth();
  return useQuery({
    ...scoreReportQuery(from ?? '', to ?? ''),
    enabled: enabled && !!token && !!from && !!to,
    placeholderData: keepPreviousData,
  });
};

export const useStoreScoreReport = (from: string | undefined, to: string | undefined, enabled = true) => {
  const { token } = useAuth();
  return useQuery({
    ...storeScoreReportQuery(from ?? '', to ?? ''),
    enabled: enabled && !!token && !!from && !!to,
    placeholderData: keepPreviousData,
  });
};
