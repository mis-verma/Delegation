import { Suspense, lazy, useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { useIsMobile } from '../../lib/useMediaQuery';
import { useNow } from '../../lib/useNow';
import { DASHBOARD_QUERY_OPTIONS, DASHBOARD_QUERY_ROOTS, invalidateDashboardQueries } from '../../lib/dashboardQuery';
import { Segmented, Skeleton } from '../../components';
import { useTicketsQuery } from '../tickets/hook';
import { useDashboardMyTasksQuery, useDashboardTasksQuery } from '../tasks/hook';
import { useTodosQuery } from '../todo/hook';
import { useMyFocusChecklistsQuery } from '../checklist/hook';
import { DashboardOverview } from './DashboardOverview';
import { NeedsApprovalCard } from './NeedsApprovalCard';
import { TicketRequestsCard } from './TicketRequestsCard';
import { FocusNowCard } from './FocusNowCard';
import { OvertimeNotice } from './OvertimeNotice';
import { OverdueTicketsPopup } from './OverdueTicketsPopup';
import { EnableAlertsBanner } from '../notifications/EnableAlertsBanner';
import { useOrgToday } from '../checklist/useOrgToday';
import { StreakGoalCard } from './StreakGoalCard';
import { CoverBanner } from './CoverBanner';
import { PeriodTabControl } from './PeriodTabControl';
import { dashboardViewFor } from './dashboardView';
import { useDashboardSummaries } from './useDashboardSummaries';
import { useExceptionTotalsQuery } from './useExceptionsQuery';
import { usePcApprovalBuckets } from '../pc/usePcApprovalBuckets';
import type { Task } from '../../api/task';
import type { ChecklistInstance } from '../../api/checklistInstances';
import type { Ticket } from '../../api/ticket';

const ExceptionsCard = lazy(() => import('./ExceptionsCard').then((m) => ({ default: m.ExceptionsCard })));
const TeamWeekHeat = lazy(() => import('./TeamWeekHeat').then((m) => ({ default: m.TeamWeekHeat })));
const MyTeamCard = lazy(() => import('../attention/MyTeamCard').then((m) => ({ default: m.MyTeamCard })));
const PcOrgFigures = lazy(() => import('../pc/PcOrgFigures').then((m) => ({ default: m.PcOrgFigures })));

const TEAM_TICKET_LIMIT = 250;
const OWN_TICKET_LIMIT = 100;
const NO_TASKS: Task[] = [];
const NO_TICKETS: Ticket[] = [];
const NO_RUNS: ChecklistInstance[] = [];

type StatScope = 'overall' | 'mine';

const STAT_SCOPE_KEY = 'tm-home-stat-scope';

const readStatScope = (): StatScope => {
  try {
    return window.localStorage.getItem(STAT_SCOPE_KEY) === 'mine' ? 'mine' : 'overall';
  } catch {
    return 'overall';
  }
};

type HomeTab = 'work' | 'team' | 'attention' | 'approvals';

const HOME_TABS: readonly HomeTab[] = ['work', 'team', 'attention', 'approvals'];
const TAB_NAME: Record<HomeTab, { full: string; short: string }> = {
  work: { full: 'My work', short: 'My work' },
  team: { full: 'My team', short: 'My team' },
  attention: { full: 'Needs attention', short: 'Attention' },
  approvals: { full: 'Approval pending', short: 'Approvals' },
};

const isHomeTab = (value: string | null): value is HomeTab => !!value && (HOME_TABS as readonly string[]).includes(value);

const withCount = (label: string, count: number) => (count > 0 ? `${label} (${count > 99 ? '99+' : count})` : label);

const PANEL_FALLBACK = <Skeleton className="h-64 rounded-2xl" />;

export const HomePage = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const dashboardView = useMemo(() => dashboardViewFor(user?.role), [user?.role]);
  const frontLine = dashboardView.frontLine;
  const hasTabs = dashboardView.orgWide || dashboardView.isHod;
  const orgToday = useOrgToday();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: HomeTab = hasTabs && isHomeTab(requested) ? requested : 'work';

  const changeTab = (next: HomeTab) => {
    setParams((prev) => {
      const out = new URLSearchParams(prev);
      if (next === 'work') out.delete('tab');
      else out.set('tab', next);
      return out;
    }, { replace: true });
  };

  const [statScope, setStatScope] = useState<StatScope>(readStatScope);
  const ownStats = hasTabs && statScope === 'mine';
  const changeStatScope = (next: StatScope) => {
    setStatScope(next);
    try {
      window.localStorage.setItem(STAT_SCOPE_KEY, next);
    } catch {
      return;
    }
  };

  const summaries = useDashboardSummaries(ownStats ? 'mine' : undefined);
  const onWorkTab = !hasTabs || tab === 'work';
  const ticketsQuery = useTicketsQuery(1, TEAM_TICKET_LIMIT, undefined, onWorkTab, DASHBOARD_QUERY_OPTIONS);
  const ownTicketsQuery = useTicketsQuery(1, OWN_TICKET_LIMIT, userId, !!userId && !frontLine, DASHBOARD_QUERY_OPTIONS);
  const tasksQuery = useDashboardTasksQuery(onWorkTab, DASHBOARD_QUERY_OPTIONS);
  const myTasksQuery = useDashboardMyTasksQuery(onWorkTab && !frontLine, DASHBOARD_QUERY_OPTIONS);
  const todosQuery = useTodosQuery(onWorkTab, DASHBOARD_QUERY_OPTIONS);
  const focusRunsQuery = useMyFocusChecklistsQuery(DASHBOARD_QUERY_OPTIONS);
  const approvalBuckets = usePcApprovalBuckets();
  const exceptionTotals = useExceptionTotalsQuery();

  const ticketPage = ticketsQuery.data;
  const allTasks = tasksQuery.data;
  const todosData = todosQuery.data;
  const focusChecklists = focusRunsQuery.data ?? NO_RUNS;
  const todos = useMemo(() => todosData ?? [], [todosData]);
  const focusQueries = frontLine
    ? [ticketsQuery, tasksQuery, todosQuery, focusRunsQuery]
    : [ticketsQuery, ownTicketsQuery, tasksQuery, myTasksQuery, todosQuery, focusRunsQuery];
  const focusPending = focusQueries.some((q) => q.isPending);
  const focusFailed = focusQueries.some((q) => q.isError && q.data === undefined);
  const retryFocus = () => {
    for (const q of focusQueries) if (q.isError) void q.refetch();
  };

  const visibleTasks = useMemo(() => allTasks ?? NO_TASKS, [allTasks]);
  const visibleTickets = useMemo(() => ticketPage?.data ?? NO_TICKETS, [ticketPage]);

  const assignedTasks = useMemo(
    () => (frontLine ? visibleTasks : (myTasksQuery.data ?? NO_TASKS)).filter((t) => t.assigneeId === userId || t.additionalAssigneeIds?.includes(userId ?? '')),
    [frontLine, visibleTasks, myTasksQuery.data, userId],
  );
  const ownTicketPage = ownTicketsQuery.data;
  const myAssignedTickets = useMemo(
    () => (frontLine ? visibleTickets.filter((t) => t.assigneeId === userId) : (ownTicketPage?.data ?? NO_TICKETS)),
    [frontLine, visibleTickets, ownTicketPage, userId],
  );

  const isRefreshing = useIsFetching({
    predicate: (query) => typeof query.queryKey[0] === 'string' && DASHBOARD_QUERY_ROOTS.includes(query.queryKey[0]),
  }) > 0;
  const refresh = useCallback(() => void invalidateDashboardQueries(queryClient), [queryClient]);

  const heading = new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const attentionCount = exceptionTotals.data
    ? exceptionTotals.data.tickets + exceptionTotals.data.delegations + exceptionTotals.data.missedRuns
    : 0;
  const approvalCount = approvalBuckets.total.pending;
  const tabLabels: Record<HomeTab, string> = {
    work: TAB_NAME.work[isMobile ? 'short' : 'full'],
    team: TAB_NAME.team[isMobile ? 'short' : 'full'],
    attention: withCount(TAB_NAME.attention[isMobile ? 'short' : 'full'], attentionCount),
    approvals: withCount(TAB_NAME.approvals[isMobile ? 'short' : 'full'], approvalCount),
  };

  const focusCard = (
    <FocusNowCard
      ownWorkOnly={!frontLine}
      hideApprovals={hasTabs}
      todayChecklist={summaries.kpi.checklistToday.data ? { total: summaries.kpi.checklistToday.data.total, completed: summaries.kpi.checklistToday.data.completed } : null}
      tasks={assignedTasks}
      tickets={myAssignedTickets}
      checklists={focusChecklists}
      todos={todos}
      now={now}
      isPending={focusPending}
      isError={focusFailed}
      onRetry={retryFocus}
      updatedAt={summaries.updatedAt}
      onRefresh={refresh}
      isRefreshing={isRefreshing}
    />
  );

  const overview = (
    <DashboardOverview
      summaries={summaries.kpi}
      taskList={frontLine || ownStats ? assignedTasks : visibleTasks}
      ticketList={ownStats ? myAssignedTickets : visibleTickets}
      todoList={todos}
      checklistList={focusChecklists}
      simple={frontLine || ownStats}
    />
  );

  const statSection = hasTabs ? (
    <section aria-labelledby="home-stats-heading" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 id="home-stats-heading" className="t-section font-display font-bold text-text">Numbers today</h2>
        <Segmented
          label="Whose numbers to show"
          value={statScope}
          onChange={changeStatScope}
          options={[
            { value: 'overall', label: dashboardView.orgWide ? 'Overall' : 'My team' },
            { value: 'mine', label: 'My own' },
          ]}
        />
      </div>
      {overview}
    </section>
  ) : overview;

  const workPanel = (
    <>
      {hasTabs && statSection}
      {focusCard}
      {!hasTabs && statSection}
      <StreakGoalCard />
    </>
  );

  return (
    <div className="flex flex-col gap-3 w-full pt-2.5">
      <h1 className="sr-only">Today, {heading}</h1>

      <OverdueTicketsPopup tickets={myAssignedTickets} userId={userId} />
      <CoverBanner />
      <OvertimeNotice today={orgToday} />
      <EnableAlertsBanner />

      {hasTabs ? (
        <>
          <PeriodTabControl value={tab} options={HOME_TABS} labels={tabLabels} onChange={changeTab} className="w-full sm:w-fit" columns={isMobile} />
          <div className="flex flex-col gap-3">
            {tab === 'work' && workPanel}
            {tab === 'team' && (
              <Suspense fallback={PANEL_FALLBACK}>
                {dashboardView.isHod ? <MyTeamCard /> : <PcOrgFigures />}
                <TeamWeekHeat />
              </Suspense>
            )}
            {tab === 'attention' && (
              <Suspense fallback={PANEL_FALLBACK}>
                <ExceptionsCard />
              </Suspense>
            )}
            {tab === 'approvals' && (
              <>
                {dashboardView.reviewsTicketRequests && <TicketRequestsCard />}
                <NeedsApprovalCard full />
              </>
            )}
          </div>
        </>
      ) : (
        <>
          {!frontLine && <NeedsApprovalCard />}
          {workPanel}
          {frontLine && <NeedsApprovalCard />}
        </>
      )}
    </div>
  );
};
