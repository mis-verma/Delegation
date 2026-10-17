import { Suspense, lazy, useCallback, useMemo, type ReactNode } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { useIsMobile } from '../../lib/useMediaQuery';
import { useNow } from '../../lib/useNow';
import { DASHBOARD_QUERY_OPTIONS, DASHBOARD_QUERY_ROOTS, invalidateDashboardQueries } from '../../lib/dashboardQuery';
import { useTicketsQuery } from '../tickets/hook';
import { useTasksQuery } from '../tasks/hook';
import { useTodosQuery } from '../todo/hook';
import { useMyChecklistInstancesQuery } from '../checklist/hook';
import { DashboardOverview } from './DashboardOverview';
import { NeedsApprovalCard } from './NeedsApprovalCard';
import { ExceptionsCard } from './ExceptionsCard';
import { FocusNowCard } from './FocusNowCard';
import { OvertimeNotice } from './OvertimeNotice';
import { useOrgToday } from '../checklist/useOrgToday';
import { MyScoresCard } from './MyScoresCard';
import { DashboardCardFrame } from './DashboardCardFrame';
import { DashboardLayoutToolbar } from './DashboardLayoutToolbar';
import { DashboardMobileCustomize } from './DashboardMobileCustomize';
import { dashboardViewFor } from './dashboardView';
import { MyTeamCard } from '../attention/MyTeamCard';
import { useDashboardLayout } from './useDashboardLayout';
import { useDashboardSummaries } from './useDashboardSummaries';
import { CARD_LABEL, type DashboardCardId } from './dashboardLayout';
import type { Task } from '../../api/task';
import type { ChecklistInstance } from '../../api/checklistInstances';
import type { Ticket } from '../../api/ticket';

// The drag-and-drop layer is loaded only once someone starts Customize.
const DashboardSortableGrid = lazy(() => import('./DashboardSortableGrid'));

// Phones drop the Today strip (it renders nothing now; the "things need you" list replaced it).
const MOBILE_HIDDEN_CARDS: ReadonlySet<DashboardCardId> = new Set(['todayStrip']);

const NO_TASKS: Task[] = [];
const NO_TICKETS: Ticket[] = [];

export const HomePage = () => {
  const { user } = useAuth();
  const userId = user?.id;
  // The one role split: the user view (User, Agent: their own work only) or the admin view (everyone else).
  const dashboardView = useMemo(() => dashboardViewFor(user?.role), [user?.role]);
  const frontLine = dashboardView.frontLine;
  const orgToday = useOrgToday();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  // Re-read every minute and when the tab comes back, so overdue and "today" stay true on a
  // dashboard that is left open all day.
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

  // Counts come from the server (useDashboardSummaries); these lists only feed the preview
  // modals, the feed and the "things need you" list, which really do need records.
  const summaries = useDashboardSummaries();
  const ticketsQuery = useTicketsQuery(1, 100, undefined, true, DASHBOARD_QUERY_OPTIONS);
  const tasksQuery = useTasksQuery(undefined, true, undefined, DASHBOARD_QUERY_OPTIONS);
  const todosQuery = useTodosQuery(true, DASHBOARD_QUERY_OPTIONS);
  // Feed and previews only: a page of recent runs, not every instance the user was ever assigned.
  const recentRunsQuery = useMyChecklistInstancesQuery({}, { limit: 25 }, DASHBOARD_QUERY_OPTIONS);
  // The "things need you" list asks the server directly for each kind it shows, so an older run sent back
  // or left unsubmitted is never missed because it fell outside the latest 25.
  const sentBackQuery = useMyChecklistInstancesQuery({ verificationStatus: 'REJECTED' }, { limit: 50 }, DASHBOARD_QUERY_OPTIONS);
  const overdueQuery = useMyChecklistInstancesQuery({ status: 'OVERDUE' }, { limit: 50 }, DASHBOARD_QUERY_OPTIONS);
  const unsentQuery = useMyChecklistInstancesQuery({ status: 'COMPLETED', verificationStatus: 'NOT_SUBMITTED' }, { limit: 50 }, DASHBOARD_QUERY_OPTIONS);
  const dueQuery = useMyChecklistInstancesQuery({ status: 'DUE' }, { limit: 50 }, DASHBOARD_QUERY_OPTIONS);

  const ticketPage = ticketsQuery.data;
  const allTasks = tasksQuery.data;
  const todosData = todosQuery.data;
  const checklistData = recentRunsQuery.data;
  const sentBackRuns = sentBackQuery.data;
  const overdueRuns = overdueQuery.data;
  const unsentRuns = unsentQuery.data;
  const dueRuns = dueQuery.data;

  const todos = useMemo(() => todosData ?? [], [todosData]);
  const focusChecklists = useMemo(() => {
    const byId = new Map<string, ChecklistInstance>();
    for (const list of [sentBackRuns, overdueRuns, unsentRuns, dueRuns, checklistData]) for (const c of list ?? []) byId.set(c.id, c);
    return [...byId.values()];
  }, [sentBackRuns, overdueRuns, unsentRuns, dueRuns, checklistData]);

  // Every list the "things need you" card reads. It only says "on track" once all of them have
  // loaded; a failed one shows an error with Retry instead.
  const focusQueries = [ticketsQuery, tasksQuery, todosQuery, recentRunsQuery, sentBackQuery, overdueQuery, unsentQuery, dueQuery];
  const focusPending = focusQueries.some((q) => q.isPending);
  const focusFailed = focusQueries.some((q) => q.isError);
  const retryFocus = () => {
    for (const q of focusQueries) if (q.isError) void q.refetch();
  };

  // Server-scoped lists: everything this role can see (just their own work for front-line roles).
  const visibleTasks = useMemo(() => allTasks ?? NO_TASKS, [allTasks]);
  const visibleTickets = useMemo(() => ticketPage?.data ?? NO_TICKETS, [ticketPage]);

  // Work a person was given to do (primary or additional assignee), not ones they only created for
  // someone else, for the "things need you" list.
  const assignedTasks = useMemo(
    () => visibleTasks.filter((t) => t.assigneeId === userId || t.additionalAssigneeIds?.includes(userId ?? '')),
    [visibleTasks, userId],
  );
  // Tickets this person has to work on (not ones they only raised), for the "things need you" list.
  const myAssignedTickets = useMemo(() => visibleTickets.filter((t) => t.assigneeId === userId), [visibleTickets, userId]);

  // Only the cards in the default orders render. The retired ids (activityOverview, compliance,
  // compareDashboard, quickActions, delegationScore, teamProgress) stay in DashboardCardId so an old
  // saved layout still type-checks, but useDashboardLayout drops them on load, so they draw nothing.
  const renderCard = (id: DashboardCardId): ReactNode => {
    switch (id) {
      case 'exceptions':
        return <ExceptionsCard />;
      case 'needsApproval':
        return <NeedsApprovalCard />;
      case 'myTeam':
        return dashboardView.isHod ? <MyTeamCard /> : null;
      case 'kpiStrip':
        return (
          <DashboardOverview
            summaries={summaries.kpi}
            taskList={visibleTasks}
            ticketList={visibleTickets}
            todoList={todos}
            checklistList={focusChecklists}
            simple={frontLine}
          />
        );
      case 'myScores':
        return <MyScoresCard />;
      default:
        // 'todayStrip' (replaced by the "things need you" list above the cards) and the retired cards.
        return null;
    }
  };

  // Cards this screen can show at all, then split into the ones on the page and the ones the person
  // hid. Hidden cards stay in the saved order, so showing one again puts it back where it was.
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

  // Rendered as the live grid, and again as the fallback while the drag-and-drop layer loads, so
  // the moment Customize starts nothing on the page moves. No bottom padding of its own: the page
  // shell already leaves room for the bottom bar.
  const staticGrid = (
    <div className="grid grid-cols-1 sm:grid-cols-2 [grid-auto-flow:row_dense] gap-3">
      {visibleCardOrder.map((id) => (
        <DashboardCardFrame key={id} size={cardSizes[id]}>
          {renderCard(id)}
        </DashboardCardFrame>
      ))}
    </div>
  );

  const heading = new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    // pt-2.5: the same top gap under the header as every other page (Tickets, Delegation, To-Do, Checklists).
    // [--type-scale:0.9]: the dashboard reads a step smaller (headings, card titles and figures; 12px small text stays
    // the floor), so a phone shows more of it at once.
    <div className="flex flex-col gap-3 w-full pt-2.5 [--type-scale:0.9]">
      <h1 className="sr-only">Today, {heading}</h1>

      {/* Every role can customize. Larger screens drag cards by a grip; a phone gets a list with
          up/down buttons and show/hide switches (see DashboardMobileCustomize). */}
      <DashboardLayoutToolbar
        isCustomizing={isCustomizing}
        onStart={() => setIsCustomizing(true)}
        onReset={resetLayout}
        onDone={() => setIsCustomizing(false)}
        hiddenCards={isCustomizing && isMobile ? [] : hiddenCards}
        onShow={(id) => toggleHidden(id as DashboardCardId)}
        touch={isMobile}
      />

      {/* The exact things to do now, most urgent first, above every card. */}
      {!isCustomizing && <OvertimeNotice today={orgToday} />}
      {!isCustomizing && (
        <FocusNowCard
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
