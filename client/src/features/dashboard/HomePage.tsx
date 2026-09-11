import { useMemo, useState } from 'react';
import { BarChart3, AlertTriangle, RotateCw, ClipboardList, TicketCheck, ListTodo, ListChecks, CalendarDays } from 'lucide-react';
import { QuickActionsGrid, type QuickAction } from '../admin/overview/QuickActionsGrid';
import { Skeleton } from '../../components/skeleton';
import { useAuth } from '../../context/AuthContext';
import { useTicketsQuery } from '../tickets/hook';
import { useTasksQuery } from '../tasks/hook';
import { useUpcomingEventsQuery } from '../events/hook';
import { useTodosQuery } from '../todo/hook';
import { useMyChecklistInstancesQuery } from '../checklist/hook';
import { TASK_SCORE } from '../tasks/taskDisplay';
import { DashboardHeader } from './DashboardHeader';
import { DashboardOverview } from './DashboardOverview';
import { MonthlyTargetCard, type FooterStat } from './MonthlyTargetCard';
import { ActivityTrendChart, ACTIVITY_CHART_HEIGHT } from './ActivityTrendChart';
import { ActivityComplianceGauges } from './ActivityComplianceGauges';
import { ActivityGroupByControl } from './ActivityGroupByControl';
import { ActivityCategoryFilter } from './ActivityCategoryFilter';
import { CompareDashboard } from './CompareDashboard';
import { TeamProgressCard } from './TeamProgressCard';
import { RecentActivity, RECENT_ACTIVITY_FEED_SIZE } from './RecentActivity';
import { UpcomingEvents } from './UpcomingEvents';
import {
  type FeedItem,
  type CompliancePeriod,
  type ActivityGroupBy,
  type ActivityCategory,
  PERIOD_LABEL,
  ACTIVITY_GROUP_RANGE_LABEL,
  ACTIVITY_CATEGORY_ORDER,
  buildActivityItems,
  periodStartDate,
  shiftPeriod,
  pointDelta,
} from './dashboardDisplay';
import type { Task } from '../../api/task';

// The user-facing counterpart to Admin Overview's QuickActionsGrid — same shared component, own
// action list (everyday work routes, not admin management pages).
const USER_QUICK_ACTIONS: readonly QuickAction[] = [
  { to: '/tasks', icon: ClipboardList, label: 'Delegations', description: 'View your assigned work' },
  { to: '/tickets', icon: TicketCheck, label: 'Tickets', description: 'Raise or track an issue' },
  { to: '/todo', icon: ListTodo, label: 'Todo', description: 'Your personal task list' },
  { to: '/checklists', icon: ListChecks, label: 'Checklists', description: "Today's runs" },
  { to: '/events', icon: CalendarDays, label: 'Events', description: 'Upcoming deadlines' },
];

export const HomePage = () => {
  const { user } = useAuth();
  // Defaulting to "month" made every completion-scoped widget open on a near-empty bucket for
  // anyone early in the calendar month — "week" is far more likely to have something in it on
  // first paint, without changing what any of the tabs themselves compute.
  const [period, setPeriod] = useState<CompliancePeriod>('week');
  const [comparePeriod, setComparePeriod] = useState<CompliancePeriod>('week');
  const [activityGroupBy, setActivityGroupBy] = useState<ActivityGroupBy>('day');
  // All four kinds on by default — toggling one off in the Activity Overview filter narrows both
  // the bar chart and the compliance gauges at once (see ActivityCategoryFilter).
  const [activeCategories, setActiveCategories] = useState<Set<ActivityCategory>>(new Set(ACTIVITY_CATEGORY_ORDER));
  const toggleCategory = (category: ActivityCategory) => {
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
  };

  const { data: ticketPage, isPending: ticketsPending, isError: ticketsFailed, refetch: refetchTickets } = useTicketsQuery(1, 100);
  const { data: allTasks, isPending: tasksPending, isError: tasksFailed, refetch: refetchTasks } = useTasksQuery();
  const { data: upcomingEvents, isPending: eventsPending } = useUpcomingEventsQuery(5);
  const { data: todos = [] } = useTodosQuery();
  // Feed-only consumer: it merges these with tasks/tickets/todos and shows the newest handful,
  // so it asks for a page rather than every instance the user has ever been assigned.
  const { data: checklistInstances = [] } = useMyChecklistInstancesQuery({}, { limit: 25 });

  const isPending = ticketsPending || tasksPending;
  // React Query drops `isPending` the moment a query settles — including when it settles as a
  // *failure* — so without this branch a failed fetch renders the entire dashboard as a confident
  // set of zeros with no indication anything is missing. Every widget below still renders (partial
  // data is more useful than none), but the banner says which half of it can't be trusted.
  const failedSources = [tasksFailed && 'Delegations', ticketsFailed && 'Tickets'].filter(Boolean) as string[];
  const retryFailed = () => {
    if (tasksFailed) void refetchTasks();
    if (ticketsFailed) void refetchTickets();
  };

  const tickets = (ticketPage?.data ?? []).filter((t) => t.userId === user?.id || t.assigneeId === user?.id);
  const tasks = (allTasks ?? []).filter(
    (t) => t.userId === user?.id || t.assigneeId === user?.id || t.additionalAssigneeIds?.includes(user?.id ?? ''),
  );

  const isOrgWideRole = user?.role === 'ADMIN' || user?.role === 'PC';
  const workflowTasks = isOrgWideRole ? (allTasks ?? []) : tasks;
  // Same org-wide-for-admin/PC treatment as workflowTasks above — the Tickets card in the KPI
  // strip and Compare Dashboard were still being fed `tickets` (always "mine", unconditionally),
  // so an ADMIN saw every delegation but only their own tickets in the same row of stat cards.
  const workflowTickets = isOrgWideRole ? (ticketPage?.data ?? []) : tickets;
  const workflowStats = {
    pending: workflowTasks.filter((t) => t.status === 'todo' || t.status === 'in_progress').length,
    approvals: workflowTasks.filter((t) => t.status === 'pending_verification').length,
    completed: workflowTasks.filter((t) => t.status === 'done').length,
    assigned: workflowTasks.length,
  };

  // "now" only needs to be approximately current for the overdue/period checks below; memoized
  // so it's read once per mount, not on every render.
  // eslint-disable-next-line react-hooks/purity
  const now = useMemo(() => Date.now(), []);

  // Was capped at 6 — which meant RecentActivity's search box, sort toggle and pagination were all
  // operating on six rows, and its second page held exactly one item (PAGE_SIZE is 5). 25 gives
  // those controls something to actually do and makes the paging land evenly, while still being a
  // "recent" window rather than the whole list (both feature pages exist for that).
  const feed: FeedItem[] = [
    ...tickets.map((t): FeedItem => ({ kind: 'ticket', id: t.id, title: t.title, status: t.status, createdAt: t.createdAt })),
    ...tasks.map((t): FeedItem => ({ kind: 'task', id: t.id, title: t.title, status: t.status, createdAt: t.createdAt })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, RECENT_ACTIVITY_FEED_SIZE);
  const nowDate = useMemo(() => new Date(now), [now]);
  const activityItems = useMemo(
    () => buildActivityItems(tasks, tickets, checklistInstances, todos, now),
    [tasks, tickets, checklistInstances, todos, now],
  );
  // The Compliance card is admin/PC-only and scopes by Department/Store/Person across the whole
  // org, not just the signed-in user's own work — it needs the unfiltered task/ticket lists
  // (`allTasks`/`ticketPage.data`), not the `tasks`/`tickets` above which are already narrowed to
  // "mine". Checklist instances and todos have no org-wide dashboard query yet (both are "my"-only
  // client-side), so those two categories stay personally-scoped even for an admin here — a real
  // gap, but not one a frontend-only change can close without a new endpoint.
  const orgActivityItems = useMemo(
    () => buildActivityItems(allTasks ?? [], ticketPage?.data ?? [], checklistInstances, todos, now),
    [allTasks, ticketPage, checklistInstances, todos, now],
  );
  const tasksCreatedIn = (periodDate: Date) => {
    const start = periodStartDate(period, periodDate).getTime();
    const end = periodStartDate(period, shiftPeriod(period, periodDate, 1)).getTime();
    return tasks.filter((t) => {
      const created = new Date(t.createdAt).getTime();
      return created >= start && created < end;
    });
  };
  const weightedScorePercent = (list: Task[]) =>
    list.length ? (list.reduce((sum, t) => sum + TASK_SCORE[t.status], 0) / list.length) * 100 : 0;

  const currentTasks = tasksCreatedIn(nowDate);
  const previousTasks = tasksCreatedIn(shiftPeriod(period, nowDate, -1));
  const targetPercent = Math.round(weightedScorePercent(currentTasks));
  const previousPercent = Math.round(weightedScorePercent(previousTasks));
  const targetChange = pointDelta(targetPercent, previousPercent);

  const totalItems = currentTasks.length;
  const doneItems = currentTasks.filter((t) => t.status === 'done').length;
  const pendingItems = totalItems - doneItems;
  const prevTotal = previousTasks.length;
  const prevDone = previousTasks.filter((t) => t.status === 'done').length;
  const prevPending = prevTotal - prevDone;

  const periodLabel = PERIOD_LABEL[period];
  const targetDescription = totalItems === 0
    ? `No delegations created ${periodLabel}.`
    : `${targetPercent}% weighted completion of ${periodLabel}'s delegations${
        prevTotal ? (targetPercent >= previousPercent ? " — ahead of the previous period's pace." : " — behind the previous period's pace.") : '.'
      }`;

  // `direction` is which way the number actually moved; `sentiment` is whether that's good news.
  // These used to be one field, which forced "Pending" to claim `direction: 'up'` whenever the
  // count had *fallen* (fewer pending being the good outcome) — so a dropping figure was drawn
  // with a green upward arrow. `lowerIsBetter` keeps that inversion in the one place it belongs.
  const movement = (current: number, previous: number, lowerIsBetter = false): Pick<FooterStat, 'direction' | 'sentiment'> => {
    if (current === previous) return { direction: 'flat', sentiment: 'neutral' };
    const rose = current > previous;
    return { direction: rose ? 'up' : 'down', sentiment: rose !== lowerIsBetter ? 'good' : 'bad' };
  };

  const targetStats: [FooterStat, FooterStat, FooterStat] = [
    { label: 'Target', value: String(totalItems), ...movement(totalItems, prevTotal) },
    { label: 'Resolved', value: String(doneItems), ...movement(doneItems, prevDone) },
    { label: 'Pending', value: String(pendingItems), ...movement(pendingItems, prevPending, true) },
  ];

  return (
    // Sections breathe wider than the cards inside them (gap-6/8 out here vs. gap-4/6 within each
    // row) — the two were inverted before, which grouped a row's own siblings less tightly than
    // the unrelated sections above and below it.
    <div className="flex flex-col gap-6 lg:gap-8 w-full animate-in fade-in duration-500 ease-out">
      <DashboardHeader userName={user?.name} />

      {failedSources.length > 0 && (
        <div
          role="alert"
          className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-danger/30 bg-danger/5 px-4 py-3.5 animate-in fade-in slide-in-from-top-1 duration-300"
        >
          <AlertTriangle size={18} strokeWidth={2.5} className="text-danger shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-display font-semibold text-text leading-tight">
              {failedSources.join(' and ')} couldn&rsquo;t load
            </p>
            <p className="text-xs font-medium text-text-muted mt-0.5">
              The figures below are incomplete until this loads — they aren&rsquo;t zero.
            </p>
          </div>
          <button
            type="button"
            onClick={retryFailed}
            className="inline-flex items-center justify-center gap-1.5 shrink-0 h-9 px-3.5 rounded-xl border border-danger/30 bg-surface text-xs font-display font-semibold text-danger hover:bg-danger/10 hover:border-danger/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40 disabled:opacity-50 transition-all duration-200 ease-in-out cursor-pointer"
          >
            <RotateCw size={14} strokeWidth={2.5} />
            Retry
          </button>
        </div>
      )}

      {/* `workflowTasks`/`workflowTickets`, not `tasks`/`tickets` — the KPI strip's Due/Completed
          drill-down modals have to list the exact records `workflowStats` counted (org-wide for
          ADMIN/PC), not the user-scoped lists, or a stat's popup would show a different set of
          records than the number it explains. */}
      <DashboardOverview isPending={isPending} tickets={workflowTickets} tasks={workflowTasks} todos={todos} workflowStats={workflowStats} />

      <QuickActionsGrid actions={USER_QUICK_ACTIONS} />

      {/* No overflow-hidden here — nothing inside needs clipping, and it was cutting off the bar
          chart's hover tooltip whenever it popped out past this card's own rounded border. The
          ambient corner glow matches the treatment every other Dashboard card (RecentActivity,
          UpcomingEvents, MonthlyTargetCard) already has. `bg-surface` is what actually made this
          card read as a peer of its siblings rather than a flat outline — it was the only padded
          card on the page with a border but no surface behind it, so it sat directly on the page's
          ambient background gradient. */}
      <section
        aria-labelledby="activity-overview-heading"
        className="relative rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface p-4 sm:p-6 lg:p-7 overflow-hidden"
      >
        <div className="absolute -top-24 -right-16 w-56 h-56 bg-primary-500/10 dark:bg-primary-400/5 rounded-full blur-[90px] pointer-events-none" />

        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary-50 dark:bg-primary-500/10 border border-primary-100 dark:border-primary-800/50 text-primary-600 dark:text-primary-400 shadow-sm">
              <BarChart3 size={20} strokeWidth={2.5} />
            </div>
            <div>
              {/* h2, like every other card title on the page — these are all siblings under the
                  greeting's h1, so the old mix of h2s and h3s across the six cards left a level
                  gap for anyone navigating by heading. */}
              <h2 id="activity-overview-heading" className="text-base sm:text-lg font-display font-bold text-text tracking-tight leading-tight">Activity Overview</h2>
              {/* Names what the groupBy tabs on the right actually scope — previously static text
                  that never changed no matter which tab (Day/Month/Quarter/Year) was selected. */}
              <p className="text-xs font-medium text-text-muted mt-0.5 tracking-wide">Delegations, tickets, checklists, and todos, over the {ACTIVITY_GROUP_RANGE_LABEL[activityGroupBy]}</p>
            </div>
          </div>
          <ActivityGroupByControl value={activityGroupBy} onChange={setActivityGroupBy} />
        </div>

        {/* Also scopes the Compliance card's gauges below — toggling a category here narrows
            both, not independently. */}
        <div className="relative">
          <ActivityCategoryFilter active={activeCategories} onToggle={toggleCategory} />
        </div>

        {isPending ? (
          // Shaped like the real chart (a row of bars rising off a baseline, plus axis labels)
          // instead of a generic spinner box — holds the chart's exact height (shared constant, so
          // the two can't drift) so nothing jumps when the real data swaps in, and reads as "this
          // specific thing is loading" rather than a placeholder that could be anything.
          <div className="mt-4 flex flex-col justify-end gap-3" style={{ height: ACTIVITY_CHART_HEIGHT }} role="status" aria-label="Loading activity overview">
            <div className="flex items-end justify-between gap-2 sm:gap-4 h-[190px] px-1">
              {[55, 80, 40, 95, 60, 75, 45].map((h, i) => (
                <Skeleton key={i} className="flex-1 max-w-11 rounded-t-md rounded-b-none" style={{ height: `${h}%` }} />
              ))}
            </div>
            <div className="flex items-center justify-between px-1">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-2.5 w-6 rounded" />
              ))}
            </div>
          </div>
        ) : (
          <div className="relative mt-4">
            <ActivityTrendChart items={activityItems} activeCategories={activeCategories} groupBy={activityGroupBy} />
          </div>
        )}
      </section>

      {/* Compliance + Delegation Score, one row — both are "how are we scoring" cards, so they
          read as a pair rather than Compliance sitting alone above an unrelated 3-up row.
          isOrgWideRole gates Compliance (Admin/PC-only, org-wide scope) — for everyone else this
          row is just Delegation Score on its own, not a half-empty grid with one dead column, so
          the grid itself only turns on when there's a second card to pair it with. */}
      <div className={isOrgWideRole ? 'grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6' : 'flex flex-col'}>
        {isOrgWideRole && (
          isPending ? (
            <div className="relative rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface p-4 sm:p-6 lg:p-7 overflow-hidden">
              <div className="absolute -top-20 -left-16 w-56 h-56 bg-primary-500/10 dark:bg-primary-400/5 rounded-full blur-[90px] pointer-events-none" />
              <div className="relative flex items-center gap-3 mb-5">
                <Skeleton className="size-10 rounded-xl shrink-0" />
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-28 rounded" />
                  <Skeleton className="h-3 w-48 rounded" />
                </div>
              </div>
              {/* Two circles, matching the two-gauge grid this replaces — same rough footprint as
                  the real 176px-diameter charts so the card doesn't visibly resize once data lands. */}
              <div className="relative grid grid-cols-2 gap-3 sm:gap-6" role="status" aria-label="Loading compliance">
                {[0, 1].map((i) => (
                  <div key={i} className="flex flex-col items-center gap-4 p-3 sm:p-6">
                    <Skeleton className="rounded-full" style={{ width: 176, height: 176, maxWidth: '100%' }} />
                    <Skeleton className="h-3 w-20 rounded" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <ActivityComplianceGauges items={orgActivityItems} activeCategories={activeCategories} groupBy={activityGroupBy} />
          )
        )}

        <MonthlyTargetCard
          percent={targetPercent}
          change={targetChange}
          description={targetDescription}
          stats={targetStats}
          period={period}
          onPeriodChange={setPeriod}
        />
      </div>

      {/* Everything else — 2x2 on desktop, one column below that. Same gap scale as the row
          above so the whole page keeps one rhythm instead of drifting between values depending on
          when a section was last touched. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 pb-8">
        {/* Compare Dashboard, like Compliance above, is an oversight widget — Admin/PC-only, same
            as the request. A regular user's dashboard shows only cards scoped to their own work.
            `workflowTasks`/`workflowTickets` (org-wide here, since this only ever renders for
            ADMIN/PC), not `tasks`/`tickets` — this is the one widget explicitly gated to org-wide
            roles specifically so it can compare across the whole org, so feeding it the "mine"-only
            lists defeated its own purpose. */}
        {isOrgWideRole && (
          <CompareDashboard tasks={workflowTasks} tickets={workflowTickets} period={comparePeriod} onPeriodChange={setComparePeriod} />
        )}
        <TeamProgressCard tasks={workflowTasks} isOrgWideRole={isOrgWideRole} />
        <RecentActivity feed={feed} isPending={isPending} />
        <UpcomingEvents events={upcomingEvents ?? []} isPending={eventsPending} />
      </div>
    </div>
  );
};