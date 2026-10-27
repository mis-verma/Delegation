import { Suspense, lazy, useCallback, useMemo, type ReactNode } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { useIsMobile } from '../../lib/useMediaQuery';
import { useNow } from '../../lib/useNow';
import { DASHBOARD_QUERY_OPTIONS, DASHBOARD_QUERY_ROOTS, invalidateDashboardQueries } from '../../lib/dashboardQuery';
import { useTicketsQuery } from '../tickets/hook';
import { useTasksQuery } from '../tasks/hook';
import { useTodosQuery } from '../todo/hook';
import { useMyFocusChecklistsQuery } from '../checklist/hook';
import { DashboardOverview } from './DashboardOverview';
import { NeedsApprovalCard } from './NeedsApprovalCard';
import { TicketRequestsCard } from './TicketRequestsCard';
import { ExceptionsCard } from './ExceptionsCard';
import { FocusNowCard } from './FocusNowCard';
import { OvertimeNotice } from './OvertimeNotice';
import { EnableAlertsBanner } from '../notifications/EnableAlertsBanner';
import { useOrgToday } from '../checklist/useOrgToday';
import { MyScoresCard } from './MyScoresCard';
import { TeamWeekHeat } from './TeamWeekHeat';
import { StreakGoalCard } from './StreakGoalCard';
import { DashboardCardFrame } from './DashboardCardFrame';
import { LazyWhenVisible } from './LazyWhenVisible';
import { DashboardLayoutToolbar } from './DashboardLayoutToolbar';
import { DashboardMobileCustomize } from './DashboardMobileCustomize';
import { dashboardViewFor } from './dashboardView';
import { MyTeamCard } from '../attention/MyTeamCard';
import { useDashboardLayout } from './useDashboardLayout';
import { useDashboardSummaries } from './useDashboardSummaries';
import { useTeamReviewCount } from './useExceptionsQuery';
import { CARD_LABEL, type DashboardCardId } from './dashboardLayout';
import type { Task } from '../../api/task';
import type { ChecklistInstance } from '../../api/checklistInstances';
import type { Ticket } from '../../api/ticket';

const DashboardSortableGrid = lazy(() => import('./DashboardSortableGrid'));

const LAZY_CARDS: ReadonlySet<DashboardCardId> = new Set(['exceptions', 'myTeam', 'myScores', 'teamHeat', 'streak']);

const MOBILE_HIDDEN_CARDS: ReadonlySet<DashboardCardId> = new Set(['todayStrip']);

const TEAM_TICKET_LIMIT = 250;
const OWN_TICKET_LIMIT = 100;
const NO_TASKS: Task[] = [];
const NO_TICKETS: Ticket[] = [];
const NO_RUNS: ChecklistInstance[] = [];

export const HomePage = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const dashboardView = useMemo(() => dashboardViewFor(user?.role), [user?.role]);
  const frontLine = dashboardView.frontLine;
  const orgToday = useOrgToday();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const now = useNow();

  const {
    order: cardOrder,
    sizes: cardSizes,
    hidden: hiddenIds,
    isCustomizing,
    setIsCustomizing,
    moveCard,
    setCardSize,
    toggleHidden,
    reset: resetLayout,
  } = useDashboardLayout(dashboardView);

  const summaries = useDashboardSummaries();
  const reviewCount = useTeamReviewCount(!frontLine, !dashboardView.isHod);
  const ticketsQuery = useTicketsQuery(1, TEAM_TICKET_LIMIT, undefined, true, DASHBOARD_QUERY_OPTIONS);
  const ownTicketsQuery = useTicketsQuery(1, OWN_TICKET_LIMIT, userId, !!userId && !frontLine, DASHBOARD_QUERY_OPTIONS);
  const tasksQuery = useTasksQuery(undefined, true, undefined, DASHBOARD_QUERY_OPTIONS);
  const todosQuery = useTodosQuery(true, DASHBOARD_QUERY_OPTIONS);
  const focusRunsQuery = useMyFocusChecklistsQuery(DASHBOARD_QUERY_OPTIONS);

  const ticketPage = ticketsQuery.data;
  const allTasks = tasksQuery.data;
  const todosData = todosQuery.data;
  const focusChecklists = focusRunsQuery.data ?? NO_RUNS;
  const todos = useMemo(() => todosData ?? [], [todosData]);
  const focusQueries = frontLine
    ? [ticketsQuery, tasksQuery, todosQuery, focusRunsQuery]
    : [ticketsQuery, ownTicketsQuery, tasksQuery, todosQuery, focusRunsQuery];
  const focusPending = focusQueries.some((q) => q.isPending);
  const focusFailed = focusQueries.some((q) => q.isError);
  const retryFocus = () => {
    for (const q of focusQueries) if (q.isError) void q.refetch();
  };

  const visibleTasks = useMemo(() => allTasks ?? NO_TASKS, [allTasks]);
  const visibleTickets = useMemo(() => ticketPage?.data ?? NO_TICKETS, [ticketPage]);

  const assignedTasks = useMemo(
    () => visibleTasks.filter((t) => t.assigneeId === userId || t.additionalAssigneeIds?.includes(userId ?? '')),
    [visibleTasks, userId],
  );
  const ownTicketPage = ownTicketsQuery.data;
  const myAssignedTickets = useMemo(
    () => (frontLine ? visibleTickets.filter((t) => t.assigneeId === userId) : (ownTicketPage?.data ?? NO_TICKETS)),
    [frontLine, visibleTickets, ownTicketPage, userId],
  );

  const renderCard = (id: DashboardCardId): ReactNode => {
    switch (id) {
      case 'exceptions':
        return <ExceptionsCard />;
      case 'ticketRequests':
        return dashboardView.reviewsTicketRequests ? <TicketRequestsCard /> : null;
      case 'needsApproval':
        return <NeedsApprovalCard />;
      case 'myTeam':
        return dashboardView.isHod ? <MyTeamCard /> : null;
      case 'kpiStrip':
        return (
          <DashboardOverview
            summaries={summaries.kpi}
            taskList={frontLine ? assignedTasks : visibleTasks}
            ticketList={visibleTickets}
            todoList={todos}
            checklistList={focusChecklists}
            simple={frontLine}
          />
        );
      case 'myScores':
        return <MyScoresCard />;
      case 'teamHeat':
        return <TeamWeekHeat />;
      case 'streak':
        return <StreakGoalCard />;
      default:
        return null;
    }
  };

  const eligibleCardOrder = useMemo(
    () => (isMobile ? cardOrder.filter((id) => !MOBILE_HIDDEN_CARDS.has(id)) : cardOrder),
    [isMobile, cardOrder],
  );
  const visibleCardOrder = useMemo(() => eligibleCardOrder.filter((id) => !hiddenIds.includes(id)), [eligibleCardOrder, hiddenIds]);
  const hiddenCards = useMemo(
    () => eligibleCardOrder.filter((id) => hiddenIds.includes(id)).map((id) => ({ id, label: CARD_LABEL[id] })),
    [eligibleCardOrder, hiddenIds],
  );

  const isRefreshing = useIsFetching({
    predicate: (query) => typeof query.queryKey[0] === 'string' && DASHBOARD_QUERY_ROOTS.includes(query.queryKey[0]),
  }) > 0;
  const refresh = useCallback(() => void invalidateDashboardQueries(queryClient), [queryClient]);

  const staticGrid = (
    <div className="grid grid-cols-1 sm:grid-cols-2 [grid-auto-flow:row_dense] gap-3 lg:gap-4">
      {visibleCardOrder.map((id) => (
        <DashboardCardFrame key={id} size={cardSizes[id]}>
          {LAZY_CARDS.has(id) ? <LazyWhenVisible>{renderCard(id)}</LazyWhenVisible> : renderCard(id)}
        </DashboardCardFrame>
      ))}
    </div>
  );

  const heading = new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="flex flex-col gap-3 w-full pt-2.5 [--type-scale:0.9]">
      <h1 className="sr-only">Today, {heading}</h1>

      <DashboardLayoutToolbar
        isCustomizing={isCustomizing}
        onStart={() => setIsCustomizing(true)}
        onReset={resetLayout}
        onDone={() => setIsCustomizing(false)}
        hiddenCards={isCustomizing && isMobile ? [] : hiddenCards}
        onShow={(id) => toggleHidden(id as DashboardCardId)}
        touch={isMobile}
      />

      {!isCustomizing && <OvertimeNotice today={orgToday} />}
      {!isCustomizing && <EnableAlertsBanner />}
      {!isCustomizing && (
        <FocusNowCard
          ownWorkOnly={!frontLine}
          reviewCount={reviewCount}
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
      )}

      {isCustomizing && isMobile ? (
        <DashboardMobileCustomize order={eligibleCardOrder} hidden={hiddenIds} onMove={moveCard} onToggle={toggleHidden} />
      ) : isCustomizing ? (
        <Suspense fallback={staticGrid}>
          <DashboardSortableGrid order={visibleCardOrder} sizes={cardSizes} renderCard={renderCard} onMove={moveCard} onSizeChange={setCardSize} onHide={toggleHidden} />
        </Suspense>
      ) : (
        staticGrid
      )}
    </div>
  );
};
