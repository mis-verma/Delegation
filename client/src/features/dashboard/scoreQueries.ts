import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { scoreApi, type ScoreReport, type ScoreReportRow, type ScoreScope } from '../../api/scores';
import { useAuth } from '../../context/AuthContext';
import { handleQueryRetry } from '../../lib/queryHelpers';

export const SCORE_QUERY_OPTIONS = {
  staleTime: 60_000,
  refetchOnWindowFocus: false,
  retry: handleQueryRetry,
} as const;

export const scoreQuery = (scope: ScoreScope, id: string | undefined, from: string, to: string) => ({
  queryKey: ['scores', scope, id ?? 'me', from, to] as const,
  queryFn: () => scoreApi.get({ scope, id, from, to }),
  ...SCORE_QUERY_OPTIONS,
});

const scoreReportQuery = (from: string, to: string) => ({
  queryKey: ['scores', 'report', from, to] as const,
  queryFn: (): Promise<ScoreReport> => scoreApi.report({ from, to }),
  ...SCORE_QUERY_OPTIONS,
});

const storeScoreReportQuery = (from: string, to: string) => ({
  queryKey: ['scores', 'report-stores', from, to] as const,
  queryFn: (): Promise<ScoreReportRow[]> => scoreApi.report({ from, to, stores: 'only' }).then((r) => r.stores),
  ...SCORE_QUERY_OPTIONS,
});

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
