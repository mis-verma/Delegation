import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { dashboardApi } from '../../api/dashboard';
import { handleQueryRetry } from '../../lib/queryHelpers';
import { DASHBOARD_QUERY_OPTIONS } from '../../lib/dashboardQuery';
import { todayPeriodBoundIso } from '../checklist/checklistDisplay';

export const useMySummaries = () => {
  const { token } = useAuth();
  const today = todayPeriodBoundIso();
  const query = useQuery({
    queryKey: ['dashboard', 'summaries', 'mine-own', today] as const,
    queryFn: () => dashboardApi.summaries({ scope: 'mine', today }),
    enabled: !!token,
    retry: handleQueryRetry,
    ...DASHBOARD_QUERY_OPTIONS,
    staleTime: 15_000,
  });
  return useMemo(() => ({
    tickets: query.data?.ticketsKpi,
    tasks: query.data?.tasksKpi,
    checklists: query.data?.checklistToday,
    isPending: query.isPending,
    isError: query.isError,
    retry: () => void query.refetch(),
  }), [query]);
};
