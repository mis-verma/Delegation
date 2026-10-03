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

/** One data source as the dashboard cards see it: enough to show a skeleton, a "No data" state
 *  with a Retry, or the numbers, per source rather than one flag for the whole page. */
export interface SummarySource<T> {
  data: T | undefined;
  /** True only while there is no data at all; a background refetch keeps the old numbers on screen. */
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

// Memoised on the four things a card can see change, so a card that receives a source only
// re-renders when its own data or state actually moves.
const useSource = <T,>(query: QueryLike<T>): SummarySource<T> => {
  const { data, isPending, isError, refetch } = query;
  return useMemo(() => ({ data, isPending, isError, onRetry: () => void refetch() }), [data, isPending, isError, refetch]);
};

// Runs complete but not yet sent for approval only matter while they are recent: an old run nobody
// submitted is a history question, not something to do today.
const READY_TO_SUBMIT_WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;

/**
 * Every server-side count the Home dashboard shows, in one place, so the Today strip and the KPI
 * strip read the same requests (identical keys are sent once) and each card gets its own
 * loading/error state.
 *
 * Two scopes, deliberately:
 *  - `kpi`: the Delegation and Ticket tiles. Everything the viewer's role can see (org-wide for
 *    ADMIN/PC, the team for managers); front-line roles get their own work, which is all they see.
 *    The Checklist and Todo tiles are always the viewer's own, so each tile agrees with the page it
 *    links to (My checklists, Todo).
 *  - `mine`: the Today strip. Always the viewer's own work, whatever their role, because it answers
 *    "what do I need to do today".
 */
export const useDashboardSummaries = () => {
  const { user } = useAuth();
  const isOwnScopeRole = !!user && OWN_SCOPE_ROLES.includes(user.role);
  const kpiScope: SummaryScope = isOwnScopeRole ? 'mine' : 'visible';
  const todayBound = todayPeriodBoundIso();
  const readyFrom = new Date(new Date(todayBound).getTime() - READY_TO_SUBMIT_WINDOW_DAYS * DAY_MS).toISOString();

  const kpiTasks = useTaskSummaryQuery(kpiScope, true, DASHBOARD_QUERY_OPTIONS);
  const kpiTickets = useTicketSummaryQuery(kpiScope, true, DASHBOARD_QUERY_OPTIONS);
  const todos = useTodoSummaryQuery(true, DASHBOARD_QUERY_OPTIONS);
  // Same two requests MyChecklists makes: all-time for Pending/Overdue/New today, and today only
  // for Completed/Total (a recurring checklist's all-time "completed" only ever climbs).
  const checklist = useChecklistInstanceSummaryQuery({ mine: true }, DASHBOARD_QUERY_OPTIONS);
  const checklistToday = useChecklistInstanceSummaryQuery({ mine: true, from: todayBound, to: todayBound }, DASHBOARD_QUERY_OPTIONS);

  // For front-line roles these resolve to the same keys as the KPI queries above, so they are free.
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
    /** Latest time any of these counts arrived (ms), 0 before the first one lands. */
    updatedAt,
  };
};

export type DashboardSummaries = ReturnType<typeof useDashboardSummaries>;
