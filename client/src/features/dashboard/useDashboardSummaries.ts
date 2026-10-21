import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
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

const READY_TO_SUBMIT_WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;

export const useDashboardSummaries = () => {
  const { user, token } = useAuth();
  const isOwnScopeRole = !!user && OWN_SCOPE_ROLES.includes(user.role);
  const kpiScope: SummaryScope = isOwnScopeRole ? 'mine' : 'visible';
  const todayBound = todayPeriodBoundIso();
  const readyFrom = new Date(new Date(todayBound).getTime() - READY_TO_SUBMIT_WINDOW_DAYS * DAY_MS).toISOString();

  const query = useQuery({
    queryKey: ['dashboard', 'summaries', kpiScope, todayBound, readyFrom] as const,
    queryFn: () => dashboardApi.summaries({ scope: kpiScope, today: todayBound, readyFrom }),
    enabled: !!token,
    retry: handleQueryRetry,
    ...DASHBOARD_QUERY_OPTIONS,
    staleTime: 15_000,
  });
  const d = query.data;
  const updatedAt = query.dataUpdatedAt;

  const kpiTasksSource = useSource<TaskSummary>({ ...query, data: d?.tasksKpi });
  const kpiTicketsSource = useSource<TicketSummary>({ ...query, data: d?.ticketsKpi });
  const todosSource = useSource<TodoSummary>({ ...query, data: d?.todos });
  const checklistSource = useSource<ChecklistInstanceSummary>({ ...query, data: d?.checklist });
  const checklistTodaySource = useSource<ChecklistInstanceSummary>({ ...query, data: d?.checklistToday });
  const myTasksSource = useSource<TaskSummary>({ ...query, data: d?.tasksMine });
  const myTicketsSource = useSource<TicketSummary>({ ...query, data: d?.ticketsMine });
  const readySource = useSource<ChecklistInstanceSummary>({ ...query, data: d?.checklistReady });

  const kpi = useMemo(
    () => ({ tasks: kpiTasksSource, tickets: kpiTicketsSource, todos: todosSource, checklist: checklistSource, checklistToday: checklistTodaySource }),
    [kpiTasksSource, kpiTicketsSource, todosSource, checklistSource, checklistTodaySource],
  );
  const mine = useMemo(
    () => ({ tasks: myTasksSource, tickets: myTicketsSource, todos: todosSource, checklist: checklistSource, readyToSubmit: readySource }),
    [myTasksSource, myTicketsSource, todosSource, checklistSource, readySource],
  );

  return {
    isOwnScopeRole,
    kpi,
    mine,
    updatedAt,
  };
};

export type DashboardSummaries = ReturnType<typeof useDashboardSummaries>;
