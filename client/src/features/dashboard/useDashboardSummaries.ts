import { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { OWN_SCOPE_ROLES } from '../../api/auth';
import type { SummaryScope } from '../../api/http';
import type { TaskSummary } from '../../api/task';
import type { TicketSummary } from '../../api/ticket';
import type { TodoSummary } from '../../api/todos';
import type { ChecklistInstanceSummary } from '../../api/checklistInstances';
import { DASHBOARD_QUERY_OPTIONS } from '../../lib/dashboardQuery';
import { useTaskSummaryQuery } from '../tasks/hook';
import { useTicketSummaryQuery } from '../tickets/hook';
import { useTodoSummaryQuery } from '../todo/hook';
import { useChecklistInstanceSummaryQuery } from '../checklist/hook';
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
  const { user } = useAuth();
  const isOwnScopeRole = !!user && OWN_SCOPE_ROLES.includes(user.role);
  const kpiScope: SummaryScope = isOwnScopeRole ? 'mine' : 'visible';
  const todayBound = todayPeriodBoundIso();
  const readyFrom = new Date(new Date(todayBound).getTime() - READY_TO_SUBMIT_WINDOW_DAYS * DAY_MS).toISOString();

  const kpiTasks = useTaskSummaryQuery(kpiScope, true, DASHBOARD_QUERY_OPTIONS);
  const kpiTickets = useTicketSummaryQuery(kpiScope, true, DASHBOARD_QUERY_OPTIONS);
  const todos = useTodoSummaryQuery(true, DASHBOARD_QUERY_OPTIONS);
  const checklist = useChecklistInstanceSummaryQuery({ mine: true }, DASHBOARD_QUERY_OPTIONS);
  const checklistToday = useChecklistInstanceSummaryQuery({ mine: true, from: todayBound, to: todayBound }, DASHBOARD_QUERY_OPTIONS);

  const myTasks = useTaskSummaryQuery('mine', true, DASHBOARD_QUERY_OPTIONS);
  const myTickets = useTicketSummaryQuery('mine', true, DASHBOARD_QUERY_OPTIONS);
  const readyToSubmit = useChecklistInstanceSummaryQuery(
    { mine: true, verificationStatus: 'NOT_SUBMITTED', from: readyFrom, to: todayBound },
    DASHBOARD_QUERY_OPTIONS,
  );

  const updatedAt = Math.max(
    kpiTasks.dataUpdatedAt, kpiTickets.dataUpdatedAt, todos.dataUpdatedAt, checklist.dataUpdatedAt,
    checklistToday.dataUpdatedAt, myTasks.dataUpdatedAt, myTickets.dataUpdatedAt, readyToSubmit.dataUpdatedAt,
  );

  const kpiTasksSource = useSource<TaskSummary>(kpiTasks);
  const kpiTicketsSource = useSource<TicketSummary>(kpiTickets);
  const todosSource = useSource<TodoSummary>(todos);
  const checklistSource = useSource<ChecklistInstanceSummary>(checklist);
  const checklistTodaySource = useSource<ChecklistInstanceSummary>(checklistToday);
  const myTasksSource = useSource<TaskSummary>(myTasks);
  const myTicketsSource = useSource<TicketSummary>(myTickets);
  const readySource = useSource<ChecklistInstanceSummary>(readyToSubmit);

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
