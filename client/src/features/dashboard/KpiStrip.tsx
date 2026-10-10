import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, ChevronRight, ClipboardCheck, ClipboardList, TicketCheck, ListTodo, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DrilldownModal, type DrilldownRow } from './DrilldownModal';
import { Skeleton } from '../../components/skeleton';
import { PANEL_CLASS } from '../../components/entityCard';
import { CountUp } from '../../components/countUp';
import { RadialGauge } from '../../components';
import { useQuery } from '@tanstack/react-query';
import { scoreApi, type Scores } from '../../api/scores';
import { windowFor } from './scorePeriods';
import { useNow } from '../../lib/useNow';
import { isInstanceOverdue } from '../checklist/checklistDisplay';
import { isTaskOverdue, isTicketLate, taskDrilldownRow } from './dashboardDisplay';
import { createdRangeHref } from '../../lib/createdRange';
import type { DashboardSummaries } from './useDashboardSummaries';
import type { Task } from '../../api/task';
import type { Ticket } from '../../api/ticket';
import type { Todo } from '../../api/todos';
import type { ChecklistInstance } from '../../api/checklistInstances';

type ModuleKey = 'delegation' | 'tickets' | 'checklist' | 'todo';
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
  /** Kept for callers; the cards are the same for everyone now (no Counts / Scores switch). */
  simple?: boolean;
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

// One card per module, the same on a phone and a desktop: a white card with the module's name, the
// open count as the headline (blue, bold) with a red overdue chip beside it, and Completed, New today
// and Total underneath. Every figure opens the matching preview. A phone shows the same card, a little
// tighter, two across.
const MiniStat = ({ label, value, onClick }: { label: string; value: number | null; onClick?: () => void }) => {
  const body = (
    <>
      <span className="block text-base sm:text-lg font-display font-bold tabular-nums leading-tight text-text">{value ?? '-'}</span>
      <span className="block truncate t-meta text-text-muted">{label}</span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="min-w-0 rounded-lg px-1 py-1 text-center outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary-500/40">
      {body}
    </button>
  ) : (
    <div className="min-w-0 px-1 py-1">{body}</div>
  );
};

// The score beside the big number: this month's overall score (completion and compliance counted equally),
// or for To-do, which has no score, the share of to-dos done.
const scoreFor = (key: ModuleKey, s: Scores | undefined, view: ModuleView): { value: number | null; label: string } => {
  if (key === 'todo') return { value: view.total ? Math.round(((view.completed ?? 0) / view.total) * 100) : null, label: 'Done' };
  if (!s) return { value: null, label: 'Score' };
  const m = key === 'delegation' ? s.delegation : key === 'tickets' ? s.ticket : s.checklist;
  if (m.due === 0) return { value: null, label: 'Score' };
  const parts = [m.completionPct, m.compliancePct].filter((v): v is number => v !== null);
  return { value: parts.length ? Math.round(parts.reduce((a, c) => a + c, 0) / parts.length) : null, label: 'Score' };
};

const gaugeColor = (v: number | null) => (v === null ? 'var(--color-border-hover)' : v >= 80 ? 'var(--color-success)' : v >= 50 ? 'var(--color-warning)' : 'var(--color-danger)');

const ModuleCard = ({ view, onOpen, score }: { view: ModuleView; onOpen: (kind: DrillKind) => void; score: { value: number | null; label: string } }) => {
  const Icon = view.icon;
  if (view.isPending) {
    return (
      <div className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-3 sm:p-4')} role="status" aria-label={`Loading ${view.noun}`}>
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="hidden sm:block h-10 w-full" />
      </div>
    );
  }
  const failed = view.isError || view.pending == null;
  return (
    <section aria-label={view.title} className={cn(PANEL_CLASS, 'flex min-w-0 flex-col gap-2.5 sm:gap-3 p-3 sm:p-4 transition-colors hover:border-border-hover')}>
      <header className="flex items-center gap-2">
        <span className="flex size-7 sm:size-8 shrink-0 items-center justify-center rounded-lg bg-primary-500/10 text-primary-600 dark:text-primary-400">
          <Icon className="size-3.5 sm:size-4" aria-hidden="true" />
        </span>
        <h3 className="min-w-0 flex-1 truncate t-card font-display font-bold text-text">{view.title}</h3>
        <Link
          viewTransition
          to={view.href}
          aria-label={`Open ${view.title}`}
          className="inline-flex size-8 sm:size-auto sm:min-h-8 shrink-0 items-center justify-center gap-0.5 rounded-lg sm:px-1.5 t-meta font-display font-semibold text-primary-600 hover:bg-surface-hover dark:text-primary-400"
        >
          <span className="hidden sm:inline">View all</span>
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </header>

      {failed ? (
        <button type="button" onClick={view.onRetry} className="rounded-lg border border-border/60 px-3 py-3 text-left t-meta text-text-muted hover:border-border-hover">
          Couldn't load {view.noun}. Tap to try again.
        </button>
      ) : (
        <>
          {/* Tablet and desktop: the open count big, bold and centred on the left, the score ring on the right. */}
          <div className="hidden sm:grid grid-cols-2 items-center gap-2">
            <button type="button" onClick={() => onOpen('pending')} className="flex flex-col items-center justify-center rounded-xl py-1 outline-none transition-colors hover:bg-surface-hover/60 focus-visible:ring-2 focus-visible:ring-primary-500/40">
              <span className="text-4xl xl:text-5xl font-display font-extrabold tabular-nums leading-none text-primary-700 dark:text-primary-300">
                <CountUp value={view.pending ?? 0} />
              </span>
              <span className="mt-1.5 t-meta font-semibold text-text-muted">Pending</span>
              {view.overdue > 0 && (
                <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 t-meta font-display font-bold tabular-nums text-danger">
                  <AlertTriangle className="size-3" aria-hidden="true" />{view.overdue} overdue
                </span>
              )}
            </button>
            <div className="flex flex-col items-center justify-center border-l border-border/60" title={score.label === 'Done' ? 'Share of to-dos done' : "This month's overall score: completion and compliance counted equally"}>
              <RadialGauge percent={score.value ?? 0} size={84} variant="circle" gradientFrom={gaugeColor(score.value)} gradientTo={gaugeColor(score.value)}>
                <span className={cn('text-base font-display font-extrabold tabular-nums', score.value === null ? 'text-text-light' : 'text-text')}>{score.value === null ? '-' : `${score.value}%`}</span>
              </RadialGauge>
              <span className="mt-1 t-meta font-semibold text-text-muted">{score.label === 'Done' ? 'Done' : 'Score this month'}</span>
            </div>
          </div>

          {/* Phone: number on the left, overdue chip on the right. */}
          <div className="flex sm:hidden items-end justify-between gap-2">
            <button type="button" onClick={() => onOpen('pending')} className="min-w-0 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40">
              <span className="block t-figure font-display font-bold tabular-nums leading-none text-primary-700 dark:text-primary-300">
                <CountUp value={view.pending ?? 0} />
              </span>
              <span className="mt-1 block t-meta font-medium text-text-muted">Pending</span>
            </button>
            {view.overdue > 0 && (
              <button
                type="button"
                onClick={() => onOpen('overdue')}
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-danger/10 px-2 py-1 t-meta font-display font-bold tabular-nums text-danger outline-none hover:bg-danger/15 focus-visible:ring-2 focus-visible:ring-danger/40"
              >
                <AlertTriangle className="size-3" aria-hidden="true" />
                {view.overdue} overdue
              </button>
            )}
          </div>
          {/* Phone: one short line. Tablet and desktop: three figures you can open. */}
          <p className="sm:hidden truncate t-meta text-text-muted tabular-nums">
            {view.completed ?? 0} done · {view.newToday ?? 0} new · {view.total ?? 0} {view.totalLabel === 'Total' ? 'total' : 'today'}
          </p>
          <div className="hidden sm:grid grid-cols-3 gap-1 border-t border-border/60 pt-2 text-center">
            <MiniStat label="Completed" value={view.completed} onClick={() => onOpen('completed')} />
            <MiniStat label="New today" value={view.newToday} onClick={() => onOpen('newToday')} />
            <MiniStat label={view.totalLabel === 'Total' ? 'Total' : 'Total today'} value={view.total} />
          </div>
        </>
      )}
    </section>
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
        key: 'checklist', icon: ClipboardCheck, title: 'Checklist', noun: 'checklists', href: '/checklists', totalLabel: 'Today',
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

  // This month's scores for the signed-in person, for the ring on each card. Same query key as the Scores
  // card's month view, so the two share one fetch.
  const month = windowFor('month', 0);
  const monthScores = useQuery({
    queryKey: ['scores', 'person', 'me', month.from, month.to],
    queryFn: () => scoreApi.get({ scope: 'person', from: month.from, to: month.to }),
    staleTime: 60_000,
  });

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

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {views.map((view) => (
          <ModuleCard key={view.key} view={view} score={scoreFor(view.key, monthScores.data, view)} onOpen={(kind) => setOpenDrill({ key: view.key, kind })} />
        ))}
      </div>

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
