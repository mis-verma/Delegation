import { Suspense, lazy, useCallback, useMemo, useState, type ReactNode } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, TicketCheck, ListTodo, ListChecks, CalendarDays } from 'lucide-react';
import { QuickActionsGrid, type QuickAction } from '../admin/overview/QuickActionsGrid';
import { Skeleton } from '../../components/skeleton';
import { InlineError } from '../../components/inlineError';
import { useAuth } from '../../context/AuthContext';
import { OWN_SCOPE_ROLES } from '../../api/auth';
import { useIsMobile } from '../../lib/useMediaQuery';
import { useNow } from '../../lib/useNow';
import { DASHBOARD_QUERY_OPTIONS, DASHBOARD_QUERY_ROOTS, invalidateDashboardQueries } from '../../lib/dashboardQuery';
import { useTicketsQuery } from '../tickets/hook';
import { useTasksQuery } from '../tasks/hook';
import { useUpcomingEventsQuery } from '../events/hook';
import { useTodosQuery } from '../todo/hook';
import { useMyChecklistInstancesQuery } from '../checklist/hook';
import { TASK_SCORE } from '../tasks/taskDisplay';
import { DashboardOverview } from './DashboardOverview';
import { MonthlyTargetCard, type FooterStat, type ScoreStatKey } from './MonthlyTargetCard';
import { ActivityOverviewCard } from './ActivityOverviewCard';
import { NeedsApprovalCard } from './NeedsApprovalCard';
import { TodayStrip } from './TodayStrip';
import { MobileTodayHero } from './MobileTodayHero';
import { TeamProgressCard } from './TeamProgressCard';
import { MyScoresCard } from './MyScoresCard';
import { RecentActivity, RECENT_ACTIVITY_FEED_SIZE } from './RecentActivity';
import { UpcomingEvents } from './UpcomingEvents';
import { DashboardCardFrame } from './DashboardCardFrame';
import { DashboardLayoutToolbar } from './DashboardLayoutToolbar';
import { useDashboardLayout } from './useDashboardLayout';
import { useDashboardSummaries } from './useDashboardSummaries';
import { CARD_LABEL, type DashboardCardId } from './dashboardLayout';
import type { DrilldownRow } from './DrilldownModal';
import {
  type FeedItem,
  type CompliancePeriod,
  type ActivityGroupBy,
  type ActivityCategory,
  PERIOD_LABEL,
  ACTIVITY_CATEGORY_ORDER,
  DASHBOARD_CARD_CLASS,
  buildActivityItems,
  periodStartDate,
  shiftPeriod,
  pointDelta,
  taskDrilldownRow,
} from './dashboardDisplay';
import type { Task } from '../../api/task';
import type { Ticket } from '../../api/ticket';

// The two heaviest cards are ADMIN/PC only and sit well below the fold, so their code (and the
// chart library behind them) loads on demand instead of with the first paint of everyone's home page.
const ActivityComplianceGauges = lazy(() => import('./ActivityComplianceGauges').then((m) => ({ default: m.ActivityComplianceGauges })));
const CompareDashboard = lazy(() => import('./CompareDashboard').then((m) => ({ default: m.CompareDashboard })));
// The drag-and-drop layer is loaded only once someone starts Customize.
const DashboardSortableGrid = lazy(() => import('./DashboardSortableGrid'));

// The user-facing counterpart to Admin Overview's QuickActionsGrid — same shared component, own
// action list (everyday work routes, not admin management pages).
const USER_QUICK_ACTIONS: readonly QuickAction[] = [
  { to: '/tasks', icon: ClipboardList, label: 'Delegations', description: 'View your assigned work', tileClassName: 'bg-activity-delegation/15 text-activity-delegation' },
  { to: '/tickets', icon: TicketCheck, label: 'Tickets', description: 'Raise or track an issue', tileClassName: 'bg-activity-ticket/15 text-activity-ticket' },
  { to: '/todo', icon: ListTodo, label: 'Todo', description: 'Your personal task list', tileClassName: 'bg-activity-todo/15 text-activity-todo' },
  { to: '/checklists', icon: ListChecks, label: 'Checklists', description: "Today's runs", tileClassName: 'bg-primary-500/15 text-primary-600 dark:text-primary-300' },
  { to: '/events', icon: CalendarDays, label: 'Events', description: 'Upcoming deadlines', tileClassName: 'bg-warning/15 text-warning' },
];

// Phones drop Quick actions (links already one tap away in the bottom nav) and Team's progress
// (its To do/In progress/Done split repeats the Delegation tile and the score above it).
const MOBILE_HIDDEN_CARDS: ReadonlySet<DashboardCardId> = new Set(['quickActions', 'teamProgress', 'todayStrip']);

const NO_TASKS: Task[] = [];
const NO_TICKETS: Ticket[] = [];

// Stand-in for a card while its data (or its code) loads. Same shell as the real cards, so nothing
// jumps when the real card lands.
const CardSkeleton = ({ label }: { label: string }) => (
  <div className={`${DASHBOARD_CARD_CLASS} p-4 sm:p-6 flex flex-col gap-5`} role="status" aria-label={`Loading ${label}`}>
    <div className="flex items-center gap-3">
      <Skeleton className="size-10 rounded-xl shrink-0" />
      <Skeleton className="h-5 w-40" />
    </div>
    <Skeleton className="h-40 w-full rounded-xl" />
  </div>
);

// A card whose source failed: its title, the reason, and a Retry. Used instead of letting a chart
// quietly draw zeros from data that never arrived.
const CardLoadError = ({ label, message, onRetry }: { label: string; message: string; onRetry: () => void }) => (
  <section aria-label={label} className={`${DASHBOARD_CARD_CLASS} p-4 sm:p-6 flex flex-col gap-3`}>
    <h2 className="t-section font-display font-bold text-text tracking-tight">{label}</h2>
    <InlineError message={message} onRetry={onRetry} />
  </section>
);

const startOfCurrent = (period: CompliancePeriod, now: Date) => periodStartDate(period, now).getTime();

export const HomePage = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const isOrgWideRole = user?.role === 'ADMIN' || user?.role === 'PC';
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
  } = useDashboardLayout(isOrgWideRole, !!user && OWN_SCOPE_ROLES.includes(user.role));

  // Every screen opens the score on "week". "Day" is empty for most people most mornings, which made
  // the first look "No data"; the Day tab is one tap away.
  const [period, setPeriod] = useState<CompliancePeriod>('week');
  // Admin and PC can flip the score between their own delegations and the whole team's.
  const [scoreScope, setScoreScope] = useState<'mine' | 'team'>('mine');
  const [comparePeriod, setComparePeriod] = useState<CompliancePeriod>('week');
  const [activityGroupBy, setActivityGroupBy] = useState<ActivityGroupBy>('day');
  // All four kinds on by default — toggling one off in the Activity Overview filter narrows both
  // the bar chart and the compliance gauges at once (see ActivityCategoryFilter).
  const [activeCategories, setActiveCategories] = useState<Set<ActivityCategory>>(new Set(ACTIVITY_CATEGORY_ORDER));
  const toggleCategory = useCallback((category: ActivityCategory) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        // Never let the filter empty out entirely — a chart with nothing selected has nothing
        // useful to show, so the last active category can't be turned off.
        if (next.size === 1) return prev;
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  // Counts come from the server (useDashboardSummaries); these lists only feed the preview
  // modals, the feed, the charts and the score, which really do need records.
  const summaries = useDashboardSummaries();
  const { data: ticketPage, isPending: ticketsPending, isError: ticketsFailed, refetch: refetchTickets } = useTicketsQuery(1, 100, undefined, true, DASHBOARD_QUERY_OPTIONS);
  const { data: allTasks, isPending: tasksPending, isError: tasksFailed, refetch: refetchTasks } = useTasksQuery(undefined, true, undefined, DASHBOARD_QUERY_OPTIONS);
  const { data: upcomingEvents, isPending: eventsPending, isError: eventsFailed, refetch: refetchEvents } = useUpcomingEventsQuery(5, DASHBOARD_QUERY_OPTIONS);
  const { data: todosData } = useTodosQuery(true, DASHBOARD_QUERY_OPTIONS);
  // Feed and previews only: a page of recent runs, not every instance the user was ever assigned.
  const { data: checklistData } = useMyChecklistInstancesQuery({}, { limit: 25 }, DASHBOARD_QUERY_OPTIONS);
  const todos = useMemo(() => todosData ?? [], [todosData]);
  const checklistInstances = useMemo(() => checklistData ?? [], [checklistData]);

  const isPending = ticketsPending || tasksPending;
  const retryTasks = useCallback(() => void refetchTasks(), [refetchTasks]);
  const retryWork = useCallback(() => {
    if (tasksFailed) void refetchTasks();
    if (ticketsFailed) void refetchTickets();
  }, [tasksFailed, ticketsFailed, refetchTasks, refetchTickets]);
  const retryEvents = useCallback(() => void refetchEvents(), [refetchEvents]);

  // Server-scoped lists: everything this role can see (just their own work for front-line roles).
  const visibleTasks = useMemo(() => allTasks ?? NO_TASKS, [allTasks]);
  const visibleTickets = useMemo(() => ticketPage?.data ?? NO_TICKETS, [ticketPage]);

  // "Mine" for the feed and the activity charts: raised by me or assigned to me.
  const tickets = useMemo(
    () => visibleTickets.filter((t) => t.userId === userId || t.assigneeId === userId),
    [visibleTickets, userId],
  );
  const tasks = useMemo(
    () => visibleTasks.filter((t) => t.userId === userId || t.assigneeId === userId || t.additionalAssigneeIds?.includes(userId ?? '')),
    [visibleTasks, userId],
  );
  // The score is about work a person was given to do, so it counts delegations assigned to them
  // (primary or additional assignee), not ones they only created for someone else.
  const assignedTasks = useMemo(
    () => visibleTasks.filter((t) => t.assigneeId === userId || t.additionalAssigneeIds?.includes(userId ?? '')),
    [visibleTasks, userId],
  );
  const teamTasks = isOrgWideRole ? visibleTasks : tasks;

  const feed = useMemo<FeedItem[]>(
    () => [
      ...tickets.map((t): FeedItem => ({ kind: 'ticket', id: t.id, title: t.title, status: t.status, createdAt: t.createdAt })),
      ...tasks.map((t): FeedItem => ({ kind: 'task', id: t.id, title: t.title, status: t.status, createdAt: t.createdAt })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, RECENT_ACTIVITY_FEED_SIZE),
    [tickets, tasks],
  );

  const nowDate = useMemo(() => new Date(now), [now]);
  const activityItems = useMemo(
    () => buildActivityItems(tasks, tickets, checklistInstances, todos, now),
    [tasks, tickets, checklistInstances, todos, now],
  );
  // The Compliance card is ADMIN/PC only and scopes by Department/Store/Person across the whole
  // org, so it needs the unfiltered task/ticket lists rather than the "mine" ones above. Checklist
  // runs and todos have no org-wide dashboard query yet, so those two categories stay personal even
  // for an admin; closing that gap needs a new endpoint, not a client change.
  const orgActivityItems = useMemo(
    () => (isOrgWideRole ? buildActivityItems(visibleTasks, visibleTickets, checklistInstances, todos, now) : []),
    [isOrgWideRole, visibleTasks, visibleTickets, checklistInstances, todos, now],
  );

  // Delegation score for the selected window versus the one before it.
  const score = useMemo(() => {
    const createdIn = (periodDate: Date) => {
      const start = startOfCurrent(period, periodDate);
      const end = startOfCurrent(period, shiftPeriod(period, periodDate, 1));
      return (scoreScope === 'team' ? visibleTasks : assignedTasks).filter((t) => {
        const created = new Date(t.createdAt).getTime();
        return created >= start && created < end;
      });
    };
    // Null, not 0, when nothing was assigned in the window: "no data" and "0%" are different facts.
    const weighted = (list: Task[]) =>
      list.length ? Math.round((list.reduce((sum, t) => sum + TASK_SCORE[t.status], 0) / list.length) * 100) : null;

    const current = createdIn(nowDate);
    const previous = createdIn(shiftPeriod(period, nowDate, -1));
    const percent = weighted(current);
    const previousPercent = weighted(previous);

    const done = current.filter((t) => t.status === 'done');
    const open = current.filter((t) => t.status !== 'done');
    const overdueOpen = open.filter((t) => t.dueDate && new Date(t.dueDate).getTime() < now).length;
    const whose = scoreScope === 'team' ? 'in the team' : 'assigned to you';
    const prevDone = previous.filter((t) => t.status === 'done').length;
    const prevOpen = previous.length - prevDone;

    // `direction` is which way the number moved; `sentiment` is whether that's good news. They used
    // to be one field, which drew a falling "Pending" count with a green upward arrow.
    const movement = (cur: number, prev: number, lowerIsBetter = false): Pick<FooterStat, 'direction' | 'sentiment'> => {
      if (cur === prev) return { direction: 'flat', sentiment: 'neutral' };
      const rose = cur > prev;
      return { direction: rose ? 'up' : 'down', sentiment: rose !== lowerIsBetter ? 'good' : 'bad' };
    };

    const stats: [FooterStat, FooterStat, FooterStat] = [
      { key: 'target', label: 'Assigned', value: String(current.length), ...movement(current.length, previous.length) },
      { key: 'resolved', label: 'Done', value: String(done.length), ...movement(done.length, prevDone) },
      {
        key: 'pending',
        label: 'Still open',
        value: String(open.length),
        // Overdue = still open and past its due date. Shown under the number so a late one is not hidden in the count.
        hint: overdueOpen > 0 ? `${overdueOpen} overdue` : undefined,
        ...movement(open.length, prevOpen, true),
      },
    ];

    const periodLabel = PERIOD_LABEL[period];
    const pace = percent != null && previousPercent != null
      ? (percent >= previousPercent ? ', ahead of the previous period.' : ', behind the previous period.')
      : '.';
    const description = percent == null
      ? `No delegations were ${scoreScope === 'team' ? 'assigned in the team' : 'assigned to you'} ${periodLabel}.`
      : `${percent}% weighted completion of the delegations ${whose} ${periodLabel}${pace}`;

    const toRows = (list: Task[]): DrilldownRow[] => list.map((t) => taskDrilldownRow(t, now));
    const drilldowns: Record<ScoreStatKey, DrilldownRow[]> = { target: toRows(current), resolved: toRows(done), pending: toRows(open) };

    return { percent, total: current.length, delta: pointDelta(percent, previousPercent), stats, description, drilldowns };
  }, [assignedTasks, visibleTasks, scoreScope, period, nowDate, now]);

  // Compare Dashboard reads org-wide lists, so it has the same "ADMIN/PC only" gate as Compliance
  // (both are absent from `cardOrder` for everyone else, see useDashboardLayout).
  const renderCard = (id: DashboardCardId): ReactNode => {
    switch (id) {
      case 'todayStrip':
        return <TodayStrip summaries={summaries} onRefresh={refresh} isRefreshing={isRefreshing} />;
      case 'needsApproval':
        return <NeedsApprovalCard />;
      case 'kpiStrip':
        return (
          <DashboardOverview
            summaries={summaries.kpi}
            taskList={visibleTasks}
            ticketList={visibleTickets}
            todoList={todos}
            checklistList={checklistInstances}
          />
        );
      case 'quickActions':
        return <QuickActionsGrid actions={USER_QUICK_ACTIONS} />;
      case 'activityOverview':
        if (tasksFailed || ticketsFailed) {
          return <CardLoadError label={CARD_LABEL.activityOverview} message={`Couldn't load ${tasksFailed && ticketsFailed ? 'delegations and tickets' : tasksFailed ? 'delegations' : 'tickets'}.`} onRetry={retryWork} />;
        }
        return (
          <ActivityOverviewCard
            isPending={isPending}
            activityItems={activityItems}
            activeCategories={activeCategories}
            onToggleCategory={toggleCategory}
            activityGroupBy={activityGroupBy}
            onGroupByChange={setActivityGroupBy}
          />
        );
      case 'compliance':
        if (tasksFailed || ticketsFailed) {
          return <CardLoadError label={CARD_LABEL.compliance} message="Couldn't load the delegations and tickets this is measured on." onRetry={retryWork} />;
        }
        return isPending ? (
          <CardSkeleton label="compliance" />
        ) : (
          <Suspense fallback={<CardSkeleton label="compliance" />}>
            <ActivityComplianceGauges items={orgActivityItems} activeCategories={activeCategories} groupBy={activityGroupBy} />
          </Suspense>
        );
      case 'delegationScore':
        return (
          <MonthlyTargetCard
            title={scoreScope === 'team' ? 'Team delegation score' : 'Your delegation score'}
            percent={score.percent}
            total={score.total}
            delta={score.delta}
            description={score.description}
            stats={score.stats}
            drilldowns={score.drilldowns}
            period={period}
            onPeriodChange={setPeriod}
            scope={isOrgWideRole ? scoreScope : undefined}
            onScopeChange={isOrgWideRole ? setScoreScope : undefined}
            isPending={tasksPending}
            isError={tasksFailed}
            onRetry={retryTasks}
          />
        );
      case 'compareDashboard':
        if (tasksFailed || ticketsFailed) {
          return <CardLoadError label={CARD_LABEL.compareDashboard} message="Couldn't load the delegations and tickets to compare." onRetry={retryWork} />;
        }
        return isPending ? (
          <CardSkeleton label="compare dashboard" />
        ) : (
          <Suspense fallback={<CardSkeleton label="compare dashboard" />}>
            <CompareDashboard tasks={visibleTasks} tickets={visibleTickets} period={comparePeriod} onPeriodChange={setComparePeriod} />
          </Suspense>
        );
      case 'myScores':
        return <MyScoresCard />;
      case 'teamProgress':
        if (tasksFailed) return <CardLoadError label={CARD_LABEL.teamProgress} message="Couldn't load delegations." onRetry={retryTasks} />;
        return tasksPending ? <CardSkeleton label="team progress" /> : <TeamProgressCard tasks={teamTasks} isOrgWideRole={isOrgWideRole} />;
      case 'recentActivity':
        return <RecentActivity feed={feed} isPending={isPending} isError={tasksFailed || ticketsFailed} onRetry={retryWork} />;
      case 'upcomingEvents':
        return <UpcomingEvents events={upcomingEvents ?? []} isPending={eventsPending} isError={eventsFailed} onRetry={retryEvents} />;
    }
  };

  // Cards this screen can show at all (phones drop two), then split into the ones on the page and the
  // ones the person hid. Hidden cards stay in the saved order, so showing one again puts it back where
  // it was.
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
  // the moment Customize starts nothing on the page moves.
  const staticGrid = (
    <div className="grid grid-cols-1 sm:grid-cols-2 [grid-auto-flow:row_dense] gap-3 pb-8">
      {visibleCardOrder.map((id) => (
        <DashboardCardFrame key={id} size={cardSizes[id]}>
          {renderCard(id)}
        </DashboardCardFrame>
      ))}
    </div>
  );

  const heading = new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    // Sections breathe wider than the cards inside them (gap-6/8 out here vs. gap-4/6 within each
    // row), so a row's own siblings group more tightly than the unrelated sections around it.
    <div className="flex flex-col gap-3 w-full">
      <h1 className="sr-only">Today, {heading}</h1>

      {/* Today, Needs your approval and Key numbers are cards in the grid below now, starting at the
          top at full width, so each one can be moved, resized or left alone like the rest. */}
      {/* Desktop only — dragging/resizing cards by a small grip handle isn't a touch-friendly
          interaction. */}
      <div className="hidden sm:block">
        <DashboardLayoutToolbar
          isCustomizing={isCustomizing}
          onStart={() => setIsCustomizing(true)}
          onReset={resetLayout}
          onDone={() => setIsCustomizing(false)}
          hiddenCards={hiddenCards}
          onShow={(id) => toggleHidden(id as DashboardCardId)}
        />
      </div>

      {/* Phones only: the three numbers to act on first, above every card. */}
      {isMobile && !isCustomizing && <MobileTodayHero summaries={summaries} />}

      {isCustomizing ? (
        <Suspense fallback={staticGrid}>
          <DashboardSortableGrid order={visibleCardOrder} sizes={cardSizes} renderCard={renderCard} onMove={moveCard} onSizeChange={setCardSize} onHide={toggleHidden} />
        </Suspense>
      ) : (
        staticGrid
      )}
    </div>
  );
};
