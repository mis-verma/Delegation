import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ClipboardList, TicketCheck, ListChecks, ListTodo, type LucideIcon } from 'lucide-react';
import { StatusBreakdownCard } from './StatusBreakdownCard';
import { DrilldownModal, type DrilldownRow } from './DrilldownModal';
import { AdminChromeAccents } from '../admin/AdminChromeAccents';
import { Skeleton } from '../../components/skeleton';
import { useNow } from '../../lib/useNow';
import { isInstanceOverdue } from '../checklist/checklistDisplay';
import { isTaskOverdue, isTicketLate, taskDrilldownRow } from './dashboardDisplay';
import { createdRangeHref } from '../../lib/createdRange';
import { scoreApi, type Scores } from '../../api/scores';
import { PeriodTabControl } from './PeriodTabControl';
import { windowFor } from './scorePeriods';
import type { DashboardSummaries } from './useDashboardSummaries';
import type { Task } from '../../api/task';
import type { Ticket } from '../../api/ticket';
import type { Todo } from '../../api/todos';
import type { ChecklistInstance } from '../../api/checklistInstances';

type ModuleKey = 'delegation' | 'tickets' | 'checklist' | 'todo';
type KpiTab = 'counts' | 'scores';
const KPI_TABS: readonly KpiTab[] = ['counts', 'scores'];
const KPI_TAB_LABEL: Record<KpiTab, string> = { counts: 'Counts', scores: 'Scores' };
const KPI_TAB_KEY = 'tm-kpi-tab';
const readTab = (): KpiTab => {
  try {
    return localStorage.getItem(KPI_TAB_KEY) === 'scores' ? 'scores' : 'counts';
  } catch {
    return 'counts';
  }
};

// The two measures of a module for this month, as one small tile: completion and compliance together.
const scoresOf = (key: ModuleKey, s: Scores | undefined): { completion: number | null; compliance: number | null; due: number } | null => {
  if (!s) return null;
  if (key === 'delegation') return { completion: s.delegation.completionPct, compliance: s.delegation.compliancePct, due: s.delegation.due };
  if (key === 'tickets') return { completion: s.ticket.completionPct, compliance: s.ticket.compliancePct, due: s.ticket.due };
  if (key === 'checklist') return { completion: s.checklist.completionPct, compliance: s.checklist.compliancePct, due: s.checklist.due };
  return null;
};

const ScoreRow = ({ label, value }: { label: string; value: number | null }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-xs font-display font-semibold text-white/80">{label}</span>
    <span className="text-base font-display font-bold tabular-nums text-white sm:text-lg">{value === null ? '-' : `${value}%`}</span>
  </div>
);

/** Completion and compliance for one module, in the same navy tile style as the counts. */
const ScoreTile = ({ title, scores, loading }: { title: string; scores: ReturnType<typeof scoresOf>; loading: boolean }) => (
  <div className="relative flex min-h-20 flex-col justify-center gap-1.5 overflow-hidden rounded-xl bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 px-3 py-2.5 text-white">
    <span className="text-xs font-display font-semibold text-white/90">{title}</span>
    {loading ? (
      <div className="h-9 animate-pulse rounded bg-white/10" role="status" aria-label={`Loading ${title} scores`} />
    ) : scores === null ? (
      <span className="text-xs font-medium text-white/70">Not scored</span>
    ) : scores.due === 0 ? (
      <span className="text-xs font-medium text-white/70">Nothing was due</span>
    ) : (
      <>
        <ScoreRow label="Completion" value={scores.completion} />
        <ScoreRow label="Compliance" value={scores.compliance} />
      </>
    )}
  </div>
);
type DrillKind = 'pending' | 'completed' | 'newToday' | 'overdue';

interface KpiStripProps {
  /** Server-side counts, one source per number group, each with its own loading and error state. */
  summaries: DashboardSummaries['kpi'];
  /** Recent records, used only to fill the preview behind a tapped figure. The numbers themselves
   *  never come from these (they are capped lists); a preview says so when it is showing fewer
   *  rows than the figure counts. */
  taskList: Task[];
  ticketList: Ticket[];
  todoList: Todo[];
  checklistList: ChecklistInstance[];
}

interface ModuleView {
  key: ModuleKey;
  icon: LucideIcon;
  title: string;
  noun: string;
  href: string;
  /** What the headline Total box counts: "Total", or "Today" for the checklist tile. */
  totalLabel: string;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  total: number | null;
  pending: number | null;
  completed: number | null;
  newToday: number | null;
  overdue: number;
}

// Where "View all" in each preview lands, per module and per kind of figure.
const VIEW_ALL_HREF: Record<ModuleKey, Record<DrillKind, string>> = {
  delegation: { pending: '/tasks?quickFilter=pending', completed: '/tasks?quickFilter=completed', newToday: '/tasks', overdue: '/tasks?quickFilter=delayed' },
  tickets: { pending: '/tickets?quickFilter=pending', completed: '/tickets?quickFilter=completed', newToday: '/tickets', overdue: '/tickets?quickFilter=delayed' },
  checklist: { pending: '/checklists?status=pending', completed: '/checklists?status=completed', newToday: '/checklists', overdue: '/checklists?status=overdue' },
  todo: { pending: '/todo?quickFilter=pending', completed: '/todo?quickFilter=completed', newToday: '/todo', overdue: '/todo?quickFilter=delayed' },
};

const DRILL_LABEL: Record<DrillKind, string> = { pending: 'Pending', completed: 'Completed', newToday: 'New today', overdue: 'Overdue' };

const startOfToday = (now: number) => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); };

const ticketRow = (t: Ticket): DrilldownRow => ({
  id: t.id, title: t.title, link: `/tickets?open=${t.id}`, createdAt: t.createdAt,
  completed: t.status === 'CLOSED', overdue: t.status !== 'CLOSED' && isTicketLate(t),
});

// Todos have no standalone detail view or `?open=` deep link, so a row points at the list page.
const todoRow = (t: Todo, now: number): DrilldownRow => ({
  id: t.id, title: t.text, link: '/todo', createdAt: t.createdAt,
  completed: t.completed, overdue: !t.completed && !!t.dueDate && new Date(t.dueDate).getTime() < now,
});

const isChecklistDone = (c: ChecklistInstance) => c.items.length > 0 && c.items.every((i) => i.isDone);

const checklistRow = (c: ChecklistInstance): DrilldownRow => {
  const completed = isChecklistDone(c);
  return { id: c.id, title: c.title, link: `/checklists/${c.id}`, createdAt: c.generatedAt, completed, overdue: isInstanceOverdue(c, completed) };
};

/**
 * Mirrors StatusBreakdownCard's real structure (same shell, header divider and right-hand total
 * box) so what loads in looks like what was loading. On the navy shell the shared Skeleton's
 * default fill is overridden to `bg-white/10` so the placeholders read against the dark ground.
 */
const KpiCardSkeleton = () => (
  <div
    className="relative flex flex-col overflow-hidden rounded-2xl border border-transparent bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700"
    role="status"
    aria-label="Loading"
  >
    <div className="relative z-10 flex items-center gap-2 px-4 min-h-11 border-b border-white/10 overflow-hidden">
      <AdminChromeAccents scale="compact" />
      <Skeleton className="size-4 rounded shrink-0 bg-white/10" />
      <Skeleton className="h-4 w-28 rounded-md bg-white/10" />
    </div>
    <div className="relative z-10 flex items-stretch gap-3 p-3">
      <div className="flex-1 flex flex-col justify-center gap-3 px-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Skeleton className="h-3.5 w-20 rounded bg-white/10" />
            <Skeleton className="h-3.5 w-6 rounded bg-white/10" />
          </div>
        ))}
      </div>
      <div className="flex flex-col items-center justify-center gap-1.5 w-24 sm:w-28 shrink-0 rounded-xl border border-white/15 bg-white/5">
        <Skeleton className="h-7 w-12 rounded-md bg-white/10" />
        <Skeleton className="h-3 w-10 rounded bg-white/10" />
      </div>
    </div>
  </div>
);

interface MobileTileProps {
  view: ModuleView;
}

// Mobile: the headline is what is still open, with the total beside it as the secondary figure, and
// a tap goes straight to that pending list. No toggle, no breakdown: the full card lives at `sm:`.
const MobileTile = ({ view }: MobileTileProps) => {
  const shell = 'relative overflow-hidden flex flex-col gap-1.5 p-2.5 rounded-xl min-h-20 bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 text-white text-left';

  if (view.isPending) {
    return <Skeleton className="min-h-20 rounded-xl" />;
  }

  const head = (
    <span className="flex items-center gap-2 min-w-0">
      <span className="text-xs font-display font-semibold text-white/90">{view.title}</span>
    </span>
  );

  if (view.isError || view.pending == null) {
    return (
      <button type="button" onClick={view.onRetry} className={`${shell} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400`}>
        {head}
        <span className="text-sm font-display font-bold">No data</span>
        <span className="text-xs font-display font-medium text-white/70">Tap to retry</span>
      </button>
    );
  }

  return (
    <Link
      to={VIEW_ALL_HREF[view.key].pending}
      aria-label={`${view.title}: ${view.pending} pending${view.total != null ? `, ${view.total} ${view.totalLabel.toLowerCase()}` : ''}${view.overdue > 0 ? `, ${view.overdue} overdue` : ''}`}
      className={`${shell} transition-transform duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
    >
      {head}
      <span className="flex items-baseline gap-1.5">
        <span className="text-xl font-display font-bold tabular-nums leading-none">{view.pending}</span>
        <span className="text-xs font-display font-medium text-white/70">pending</span>
      </span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {view.total != null && (
          <span className="text-xs font-display font-medium text-white/70 tabular-nums">
            of {view.total} {view.totalLabel === 'Total' ? 'total' : 'today'}
          </span>
        )}
        {view.overdue > 0 && (
          <span className="inline-flex items-center h-5 px-1.5 rounded-full bg-danger text-white text-xs font-display font-bold tabular-nums">
            {view.overdue} overdue
          </span>
        )}
      </span>
    </Link>
  );
};

export const KpiStrip = ({ summaries, taskList, ticketList, todoList, checklistList }: KpiStripProps) => {
  const now = useNow();
  const [openDrill, setOpenDrill] = useState<{ key: ModuleKey; kind: DrillKind } | null>(null);
  const { tasks, tickets, todos, checklist, checklistToday } = summaries;

  const views = useMemo<ModuleView[]>(() => {
    const t = tasks.data;
    const k = tickets.data;
    const d = todos.data;
    const c = checklist.data;
    const ct = checklistToday.data;
    return [
      {
        key: 'delegation', icon: ClipboardList, title: 'Delegation', noun: 'delegations', href: '/tasks', totalLabel: 'Total',
        isPending: tasks.isPending, isError: tasks.isError, onRetry: tasks.onRetry,
        total: t?.total ?? null, pending: t?.pending ?? null, completed: t?.completed ?? null, newToday: t?.newToday ?? null, overdue: t?.overdue ?? 0,
      },
      {
        key: 'tickets', icon: TicketCheck, title: 'Tickets', noun: 'tickets', href: '/tickets', totalLabel: 'Total',
        isPending: tickets.isPending, isError: tickets.isError, onRetry: tickets.onRetry,
        total: k?.total ?? null, pending: k?.pending ?? null, completed: k?.completed ?? null, newToday: k?.newToday ?? null, overdue: k?.overdue ?? 0,
      },
      {
        // Pending/New today are all-time and Completed/Total are today's, exactly as the My
        // checklists page counts them, so the tile and the page it opens always agree.
        key: 'checklist', icon: ListChecks, title: 'Checklist', noun: 'checklists', href: '/checklists', totalLabel: 'Today',
        isPending: checklist.isPending || checklistToday.isPending, isError: checklist.isError || checklistToday.isError,
        onRetry: () => { if (checklist.isError) checklist.onRetry(); if (checklistToday.isError) checklistToday.onRetry(); },
        total: ct?.total ?? null, pending: c?.pending ?? null, completed: ct?.completed ?? null, newToday: c?.newToday ?? null, overdue: c?.overdue ?? 0,
      },
      {
        // Always the viewer's own todos, even for an admin: todos have no org-wide view.
        key: 'todo', icon: ListTodo, title: 'Todo', noun: 'todos', href: '/todo', totalLabel: 'Total',
        isPending: todos.isPending, isError: todos.isError, onRetry: todos.onRetry,
        total: d?.total ?? null, pending: d?.pending ?? null, completed: d?.completed ?? null, newToday: d?.newToday ?? null, overdue: d?.overdue ?? 0,
      },
    ];
  }, [tasks, tickets, todos, checklist, checklistToday]);

  const drilldown = useMemo(() => {
    if (!openDrill) return null;
    const { key, kind } = openDrill;
    const view = views.find((v) => v.key === key)!;
    const today = startOfToday(now);
    const isNew = (iso: string) => new Date(iso).getTime() >= today;

    let rows: DrilldownRow[];
    if (key === 'delegation') {
      const pick = {
        pending: (x: Task) => x.status !== 'done' && x.status !== 'draft',
        completed: (x: Task) => x.status === 'done',
        newToday: (x: Task) => isNew(x.createdAt),
        overdue: (x: Task) => isTaskOverdue(x, now),
      }[kind];
      rows = taskList.filter(pick).map((x) => taskDrilldownRow(x, now));
    } else if (key === 'tickets') {
      const pick = {
        pending: (x: Ticket) => x.status !== 'CLOSED',
        completed: (x: Ticket) => x.status === 'CLOSED',
        newToday: (x: Ticket) => isNew(x.createdAt),
        overdue: (x: Ticket) => x.status !== 'CLOSED' && isTicketLate(x),
      }[kind];
      rows = ticketList.filter(pick).map(ticketRow);
    } else if (key === 'checklist') {
      const pick = {
        pending: (x: ChecklistInstance) => !isChecklistDone(x),
        // The tile's Completed figure is TODAY's, so the preview only lists runs from today. It used
        // to list every finished run in the recent list, which is a different number.
        completed: (x: ChecklistInstance) => isChecklistDone(x) && isNew(x.generatedAt),
        newToday: (x: ChecklistInstance) => isNew(x.generatedAt),
        overdue: (x: ChecklistInstance) => isInstanceOverdue(x, isChecklistDone(x)),
      }[kind];
      rows = checklistList.filter(pick).map(checklistRow);
    } else {
      const pick = {
        pending: (x: Todo) => !x.completed,
        completed: (x: Todo) => x.completed,
        newToday: (x: Todo) => isNew(x.createdAt),
        overdue: (x: Todo) => !x.completed && !!x.dueDate && new Date(x.dueDate).getTime() < now,
      }[kind];
      rows = todoList.filter(pick).map((x) => todoRow(x, now));
    }

    const counted = { pending: view.pending, completed: view.completed, newToday: view.newToday, overdue: view.overdue }[kind];
    // "New today" opens the list already narrowed to today (the same filter the chart bars use), not the
    // whole unfiltered list the figure is a small part of.
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const viewAllHref = kind === 'newToday' ? createdRangeHref(view.href, new Date(today), tomorrow) : VIEW_ALL_HREF[key][kind];

    return {
      title: `${DRILL_LABEL[kind]} ${view.noun}`,
      description: counted != null ? `${counted} ${counted === 1 ? view.noun.replace(/s$/, '') : view.noun} in total` : undefined,
      icon: view.icon,
      rows,
      total: counted ?? undefined,
      viewAllHref,
      viewAllLabel: `View all in ${view.title}`,
    };
  }, [openDrill, views, now, taskList, ticketList, todoList, checklistList]);

  const [tab, setTabState] = useState<KpiTab>(readTab);
  const setTab = (next: KpiTab) => {
    setTabState(next);
    try {
      localStorage.setItem(KPI_TAB_KEY, next);
    } catch {
      /* a refused write only forgets the choice */
    }
  };
  // This month's scores for the signed-in person: the same query key as the Scores card's month view, so the two share one fetch.
  const month = windowFor('month', 0);
  const monthScores = useQuery({
    queryKey: ['scores', 'person', 'me', month.from, month.to],
    queryFn: () => scoreApi.get({ scope: 'person', from: month.from, to: month.to }),
    enabled: tab === 'scores',
    staleTime: 60_000,
  });

  return (
    <div className="@container flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="w-44">
          <PeriodTabControl value={tab} options={KPI_TABS} labels={KPI_TAB_LABEL} onChange={setTab} fill dense />
        </div>
        {tab === 'scores' && <span className="text-xs font-medium text-text-muted">{month.label}</span>}
      </div>

      {tab === 'scores' ? (
        <div className="grid grid-cols-2 gap-3 @5xl:grid-cols-4">
          {views.map((view) => (
            <ScoreTile key={view.key} title={view.title} scores={scoresOf(view.key, monthScores.data)} loading={monthScores.isPending} />
          ))}
        </div>
      ) : (
      <>
      <div className="grid sm:hidden grid-cols-2 gap-2.5">
        {views.map((view) => <MobileTile key={view.key} view={view} />)}
      </div>

      <div className="hidden sm:grid grid-cols-1 @xl:grid-cols-2 @5xl:grid-cols-4 gap-3">
        {views.map((view) => {
          if (view.isPending) return <KpiCardSkeleton key={view.key} />;
          const open = (kind: DrillKind) => () => setOpenDrill({ key: view.key, kind });
          return (
            <StatusBreakdownCard
              key={view.key}
              variant="navy"
              icon={view.icon}
              title={view.title}
              href={view.href}
              total={view.isError ? null : view.total}
              totalLabel={view.totalLabel}
              error={view.isError ? { message: `Couldn't load ${view.noun}.`, onRetry: view.onRetry } : undefined}
              overdue={{ value: view.overdue, onClick: open('overdue') }}
              rows={[
                { label: 'Pending', value: view.pending, onClick: open('pending') },
                { label: 'Completed', value: view.completed, onClick: open('completed') },
                { label: 'New today', value: view.newToday, onClick: open('newToday') },
              ]}
            />
          );
        })}
      </div>
      </>
      )}

      {drilldown && (
        <DrilldownModal
          open
          onClose={() => setOpenDrill(null)}
          title={drilldown.title}
          description={drilldown.description}
          icon={drilldown.icon}
          rows={drilldown.rows}
          total={drilldown.total}
          viewAllHref={drilldown.viewAllHref}
          viewAllLabel={drilldown.viewAllLabel}
        />
      )}
    </div>
  );
};
