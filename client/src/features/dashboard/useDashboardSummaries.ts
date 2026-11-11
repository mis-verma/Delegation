import { useEffect, useMemo } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { OWN_SCOPE_ROLES } from '../../api/auth';
import type { SummaryScope } from '../../api/http';
import type { TaskSummary } from '../../api/task';
import type { TicketSummary } from '../../api/ticket';
import type { TodoSummary } from '../../api/todos';
import type { ChecklistInstanceSummary } from '../../api/checklistInstances';
import { dashboardApi } from '../../api/dashboard';
import { handleQueryRetry } from '../../lib/queryHelpers';
import { DASHBOARD_QUERY_OPTIONS } from '../../lib/dashboardQuery';
import { todayPeriodBoundIso } from '../checklist/checklistDisplay';

export interface SummarySource<T> {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
}

interface QueryLike<T> {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
  refetch: () => unknown;
  dataUpdatedAt: number;
}

const useSource = <T,>(query: QueryLike<T>): SummarySource<T> => {
  const { data, isPending, isError, refetch } = query;
  return useMemo(() => ({ data, isPending, isError, onRetry: () => void refetch() }), [data, isPending, isError, refetch]);
};

export const useDashboardSummaries = (scopeOverride?: SummaryScope) => {
  const { user, token } = useAuth();
  const isOwnScopeRole = !!user && OWN_SCOPE_ROLES.includes(user.role);
  const kpiScope: SummaryScope = isOwnScopeRole ? 'mine' : (scopeOverride ?? 'visible');
  const todayBound = todayPeriodBoundIso();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['dashboard', 'summaries', kpiScope, todayBound] as const,
    queryFn: () => dashboardApi.summaries({ scope: kpiScope, today: todayBound }),
    enabled: !!token,
    retry: handleQueryRetry,
    placeholderData: keepPreviousData,
    ...DASHBOARD_QUERY_OPTIONS,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!token || isOwnScopeRole) return;
    const other: SummaryScope = kpiScope === 'mine' ? 'visible' : 'mine';
    void queryClient.prefetchQuery({
      queryKey: ['dashboard', 'summaries', other, todayBound] as const,
      queryFn: () => dashboardApi.summaries({ scope: other, today: todayBound }),
      staleTime: 15_000,
    });
  }, [token, isOwnScopeRole, kpiScope, todayBound, queryClient]);
  const d = query.data;
  const updatedAt = query.dataUpdatedAt;

  const part = <T,>(value: T | undefined): QueryLike<T> => ({ ...query, data: value, isError: value === undefined && (query.isError || query.data !== undefined) });
  const kpiTasksSource = useSource<TaskSummary>(part(d?.tasksKpi));
  const kpiTicketsSource = useSource<TicketSummary>(part(d?.ticketsKpi));
  const todosSource = useSource<TodoSummary>(part(d?.todos));
  const checklistTodaySource = useSource<ChecklistInstanceSummary>(part(d?.checklistToday));
  const orgChecklistTodaySource = useSource<ChecklistInstanceSummary>(part(d?.orgChecklistToday));
  const scopeChecklistTodaySource = useSource<ChecklistInstanceSummary>(part(d?.scopeChecklistToday));

  const kpi = useMemo(
    () => ({ tasks: kpiTasksSource, tickets: kpiTicketsSource, todos: todosSource, checklistToday: checklistTodaySource, orgChecklistToday: orgChecklistTodaySource, scopeChecklistToday: scopeChecklistTodaySource }),
    [kpiTasksSource, kpiTicketsSource, todosSource, checklistTodaySource, orgChecklistTodaySource, scopeChecklistTodaySource],
  );

  return {
    isOwnScopeRole,
    kpi,
    updatedAt,
  };
};

export type DashboardSummaries = ReturnType<typeof useDashboardSummaries>;
