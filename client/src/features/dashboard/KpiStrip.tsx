import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, ChevronRight, ClipboardCheck, ClipboardList, TicketCheck, ListTodo, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DrilldownModal, type DrilldownRow } from './DrilldownModal';
import { Skeleton } from '../../components/skeleton';
import { PANEL_CLASS } from '../../components/entityCard';
import { CountUp } from '../../components/countUp';
import { IconChip, RadialGauge } from '../../components';
import { useQuery } from '@tanstack/react-query';
import type { Scores } from '../../api/scores';
import { windowFor } from './scorePeriods';
import { scoreQuery } from './scoreQueries';
import { moduleOverall } from './scoreMetrics';
import { capWindowAtToday } from '../scores/useScoreWindow';
import { HowCalculated } from '../scores/HowCalculated';
import type { ScoreModule } from '../../lib/scoreLabels';
import { useNow } from '../../lib/useNow';
import { useOrgToday } from '../checklist/useOrgToday';
import { describeDueBy, instanceDeadline, instanceOpensOnLaterDay, isInstanceEnded, isInstanceOverdue } from '../checklist/checklistDisplay';
import { doneLabel, dueLabel, isTaskOverdue, isTicketLate, taskDrilldownRow } from './dashboardDisplay';
import { createdRangeHref } from '../../lib/createdRange';
import type { DashboardSummaries } from './useDashboardSummaries';
import type { Task } from '../../api/task';
import type { Ticket } from '../../api/ticket';
import type { Todo } from '../../api/todos';
import type { ChecklistInstance } from '../../api/checklistInstances';
import { formatPct, roundPct } from '../../lib/percent';
import { isTicketHandedIn, isTaskHandedIn } from '../../lib/handedIn';

type ModuleKey = 'delegation' | 'tickets' | 'checklist' | 'todo';
type DrillKind = 'pending' | 'completed' | 'newToday' | 'overdue';

interface KpiStripProps {
  summaries: DashboardSummaries['kpi'];
  taskList: Task[];
  ticketList: Ticket[];
  todoList: Todo[];
  checklistList: ChecklistInstance[];
  simple?: boolean;
}

interface ModuleView {
  key: ModuleKey;
  icon: LucideIcon;
  title: string;
  noun: string;
  href: string;
  todayCounts: boolean;
  scope: 'team' | 'mine';
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  total: number | null;
  pending: number | null;
  completed: number | null;
  newToday: number | null;
  overdue: number;
}

const VIEW_ALL_HREF: Record<ModuleKey, Record<DrillKind, string>> = {
  delegation: { pending: '/tasks?quickFilter=pending', completed: '/tasks?quickFilter=completed', newToday: '/tasks', overdue: '/tasks?quickFilter=delayed' },
  tickets: { pending: '/tickets?quickFilter=pending', completed: '/tickets?quickFilter=completed', newToday: '/tickets', overdue: '/tickets?quickFilter=delayed' },
  checklist: { pending: '/checklists?status=pending', completed: '/checklists?status=completed', newToday: '/checklists', overdue: '/checklists?status=overdue' },
  todo: { pending: '/todo?quickFilter=pending', completed: '/todo?quickFilter=completed', newToday: '/todo', overdue: '/todo?quickFilter=delayed' },
};

const DRILL_LABEL: Record<DrillKind, string> = { pending: 'Pending', completed: 'Completed', newToday: 'New today', overdue: 'Overdue' };

const PAGE_NAME: Record<ModuleKey, string> = { delegation: 'Delegation', tickets: 'Tickets', checklist: 'Checklists', todo: 'To-do' };

const DRILL_SUBTITLE = (view: ModuleView, kind: DrillKind): string =>
  kind === 'pending' ? 'open right now' : kind === 'newToday' ? 'added today' : kind === 'overdue' ? 'past their deadline' : view.todayCounts ? 'finished today' : 'finished, all time';

const EMPTY_TITLE: Record<DrillKind, string> = { pending: 'Nothing pending', completed: 'Nothing finished yet', newToday: 'Nothing new today', overdue: 'Nothing overdue' };
const EMPTY_REASON: Record<DrillKind, string> = { pending: 'are open right now', completed: 'have been finished yet', newToday: 'were added today', overdue: 'are past their deadline' };

const startOfToday =(now: number) => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); };

const ticketRow = (t: Ticket, now: number): DrilldownRow => {
  const completed = isTicketHandedIn(t);
  const overdue = !completed && isTicketLate(t);
  return {
    id: t.id, title: t.title, link: `/tickets?open=${t.id}`, createdAt: t.createdAt, completed, overdue,
    meta: completed ? doneLabel(t.submittedAt ?? t.closedAt ?? t.updatedAt, now) : t.tatDueAt ? dueLabel(t.tatDueAt, now, overdue) : 'No due time',
    dueAt: t.tatDueAt ? new Date(t.tatDueAt).getTime() : null,
  };
};

const todoRow = (t: Todo, now: number): DrilldownRow => {
  const overdue = !t.completed && !!t.dueDate && new Date(t.dueDate).getTime() < now;
  return {
    id: t.id, title: t.text, link: '/todo', createdAt: t.createdAt, completed: t.completed, overdue,
    meta: t.completed ? 'Done' : t.dueDate ? dueLabel(t.dueDate, now, overdue) : 'No due date',
    dueAt: t.dueDate ? new Date(t.dueDate).getTime() : null,
  };
};

const isChecklistDone = (c: ChecklistInstance) => c.items.length > 0 && c.items.every((i) => i.isDone);

const isChecklistLive = (c: ChecklistInstance, now: number) => c.isMissed !== true && !isInstanceEnded(c, now) && !instanceOpensOnLaterDay(c, now);

const checklistRow = (c: ChecklistInstance, now: number): DrilldownRow => {
  const completed = isChecklistDone(c);
  const deadline = instanceDeadline(c);
  const overdue = isInstanceOverdue(c, completed);
  const meta = completed
    ? c.verificationStatus === 'NOT_SUBMITTED' ? 'Done, ready to submit' : 'Done'
    : c.verificationStatus === 'REJECTED' ? 'Sent back, fix and submit again'
    : overdue ? `Late since ${describeDueBy(deadline, now).replace(/^Due by /, '')}`
    : describeDueBy(deadline, now);
  return { id: c.id, title: c.title, link: `/checklists/${c.id}`, createdAt: c.generatedAt, completed, overdue, meta, dueAt: deadline };
};

const MiniStat = ({ label, shortLabel, value, onClick }: { label: string; shortLabel: string; value: number | null; onClick?: () => void }) => {
  const body = (
    <>
      <span className="block t-card sm:text-lg font-display font-semibold sm:font-bold tabular-nums leading-tight text-text">{value ?? '-'}</span>
      <span className="block break-words t-meta leading-tight text-text-muted">
        <span className="sm:hidden">{shortLabel}</span>
        <span className="hidden sm:inline">{label}</span>
      </span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="flex min-w-0 min-h-11 sm:min-h-0 flex-col items-center justify-start rounded-xl bg-surface-hover/50 px-1 py-2 text-center outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary-500/40">
      {body}
    </button>
  ) : (
    <div className="flex min-w-0 min-h-11 sm:min-h-0 flex-col items-center justify-start rounded-xl bg-surface-hover/50 px-1 py-2 text-center">{body}</div>
  );
};

const MODULE_TONE: Record<ModuleKey, { tile: string; text: string }> = {
  delegation: { tile: 'bg-linear-to-br from-coral-500 to-coral-600', text: 'text-coral-600 dark:text-coral-300' },
  tickets: { tile: 'bg-linear-to-br from-success to-success/70', text: 'text-success' },
  checklist: { tile: 'bg-linear-to-br from-primary-500 to-primary-600', text: 'text-primary-700 dark:text-primary-300' },
  todo: { tile: 'bg-linear-to-br from-warning to-warning/70', text: 'text-warning' },
};

const SCORE_MODULE: Record<Exclude<ModuleKey, 'todo'>, ScoreModule> = { delegation: 'delegation', tickets: 'ticket', checklist: 'checklist' };

const scoreFor = (key: ModuleKey, s: Scores | undefined, view: ModuleView): { value: number | null; label: string } => {
  if (key === 'todo') return { value: view.total ? roundPct(((view.completed ?? 0) / view.total) * 100) : null, label: 'Done' };
  if (!s) return { value: null, label: 'Score' };
  return { value: moduleOverall(s, SCORE_MODULE[key]), label: 'Score' };
};

const gaugeColor = (v: number | null) => (v === null ? 'var(--color-border-hover)' : v >= 80 ? 'var(--color-success)' : v >= 50 ? 'var(--color-warning)' : 'var(--color-danger)');

const ModuleCard = ({ view, onOpen, score, scopeTag }: { view: ModuleView; onOpen: (kind: DrillKind) => void; score: { value: number | null; label: string }; scopeTag?: string }) => {
  const Icon = view.icon;
  if (view.isPending) {
    return (
      <div className={cn(PANEL_CLASS, 'flex flex-col gap-2 sm:gap-3 p-3 sm:p-4')} role="status" aria-label={`Loading ${view.noun}`}>
        <div className="flex h-10 sm:h-8 items-center gap-2">
          <Skeleton className="hidden sm:block size-8 shrink-0 rounded-lg" />
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="flex h-11 flex-col justify-end gap-1 sm:hidden">
          <Skeleton className="h-6 w-12" />
          <Skeleton className="h-3.5 w-14" />
        </div>
        <Skeleton className="hidden sm:block h-28 w-full rounded-xl" />
        <div className="grid grid-cols-3 gap-1 border-t border-border/60 pt-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="mx-auto h-11 sm:h-12 w-10 sm:w-14 rounded-lg" />)}
        </div>
      </div>
    );
  }
  const failed = view.isError || view.pending == null;
  const scoreModule = view.key === 'todo' ? null : SCORE_MODULE[view.key];
  const tone = MODULE_TONE[view.key];
  return (
    <section aria-label={scopeTag ? `${view.title}, ${scopeTag.toLowerCase()}` : view.title} className={cn(PANEL_CLASS, 'flex min-w-0 flex-col gap-2 sm:gap-3 p-3 sm:p-4 transition-colors hover:border-border-hover')}>
      <header className="flex items-center gap-2">
        <span className={cn('hidden sm:flex size-9 shrink-0 items-center justify-center rounded-xl text-white', tone.tile)}>
          <Icon className="size-[1.125rem]" strokeWidth={2.25} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 leading-snug t-meta sm:t-card font-display font-bold text-text">{view.title}</h3>
          {scopeTag && <p className="t-meta text-text-muted">{scopeTag}</p>}
        </div>
        <Link
          viewTransition
          to={view.href}
          aria-label={`Open ${view.title}`}
          className="inline-flex size-10 sm:size-auto sm:min-h-8 shrink-0 items-center justify-center gap-0.5 rounded-lg sm:px-1.5 t-meta font-display font-semibold text-primary-600 hover:bg-surface-hover dark:text-primary-400"
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
          <div className="hidden sm:grid grid-cols-2 items-center gap-2">
            <button type="button" onClick={() => onOpen('pending')} className="flex flex-col items-center justify-center rounded-xl py-1 outline-none transition-colors hover:bg-surface-hover/60 focus-visible:ring-2 focus-visible:ring-primary-500/40">
              <span className={cn('t-stat font-display font-extrabold leading-none', tone.text)}>
                <CountUp value={view.pending ?? 0} />
              </span>
              <span className="mt-1.5 t-meta font-semibold text-text-muted">Pending now</span>
              {view.overdue > 0 && (
                <IconChip className="mt-1.5" icon={AlertTriangle} tone="bg-danger" label={`${view.overdue} overdue`} labelClassName="tabular-nums" />
              )}
            </button>
            <div className="flex flex-col items-center justify-center border-l border-border/60">
              <RadialGauge percent={score.value ?? 0} size={84} variant="circle" ariaLabel={`${score.label === 'Done' ? 'To-dos done' : 'Score this month'} ${formatPct(score.value)}`} gradientFrom={gaugeColor(score.value)} gradientTo={gaugeColor(score.value)}>
                <span className={cn('text-base font-display font-extrabold tabular-nums', score.value === null ? 'text-text-light' : 'text-text')}>{formatPct(score.value)}</span>
              </RadialGauge>
              <span className="mt-1 flex min-h-[2.8em] items-center justify-center gap-0.5 text-center t-meta font-semibold text-text-muted">
                {score.label === 'Done' ? 'To-dos done' : 'Score this month'}
                {scoreModule && <HowCalculated figure="overall" module={scoreModule} />}
              </span>
            </div>
          </div>

          <div className="flex sm:hidden flex-col gap-1.5">
            <div className="grid grid-cols-2 items-center gap-1">
              <button type="button" onClick={() => onOpen('pending')} className="min-w-0 rounded-lg text-center outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40">
                <span className={cn('block t-stat font-display font-bold tabular-nums leading-none', tone.text)}>
                  <CountUp value={view.pending ?? 0} />
                </span>
                <span className="mt-1 block t-meta font-medium text-text-muted">Pending</span>
              </button>
              <div className="flex flex-col items-center border-l border-border/60" aria-label={`${score.label === 'Done' ? 'To-dos done' : 'Score this month'}: ${formatPct(score.value)}`}>
                <RadialGauge percent={score.value ?? 0} size={56} variant="circle" ariaLabel={`${score.label === 'Done' ? 'To-dos done' : 'Score this month'} ${formatPct(score.value)}`} gradientFrom={gaugeColor(score.value)} gradientTo={gaugeColor(score.value)}>
                  <span className={cn('t-meta font-display font-extrabold tabular-nums', score.value === null ? 'text-text-light' : 'text-text')}>{formatPct(score.value)}</span>
                </RadialGauge>
                <span className="mt-0.5 t-meta font-medium text-text-muted">{score.label === 'Done' ? 'Done' : 'Score'}</span>
              </div>
            </div>
            {view.overdue > 0 && (
              <button
                type="button"
                onClick={() => onOpen('overdue')}
                className="shrink-0 self-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
              >
                <IconChip icon={AlertTriangle} tone="bg-danger" label={`${view.overdue} overdue`} labelClassName="tabular-nums" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <MiniStat label={view.todayCounts ? 'Done today' : 'Done'} shortLabel="Done" value={view.completed} onClick={() => onOpen('completed')} />
            <MiniStat label="New today" shortLabel="New" value={view.newToday} onClick={() => onOpen('newToday')} />
            <MiniStat label={view.todayCounts ? 'Total today' : 'Total'} shortLabel="Total" value={view.total} />
          </div>
        </>
      )}
    </section>
  );
};

const SCOPE_TAG: Record<ModuleView['scope'], string> = { team: 'Team', mine: 'Yours' };

export const KpiStrip = ({ summaries, taskList, ticketList, todoList, checklistList, simple = false }: KpiStripProps) => {
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
        key: 'delegation', icon: ClipboardList, title: 'Delegation', noun: 'delegations', href: '/tasks', todayCounts: false, scope: 'team',
        isPending: tasks.isPending, isError: tasks.isError, onRetry: tasks.onRetry,
        total: t?.total ?? null, pending: t?.pending ?? null, completed: t?.completed ?? null, newToday: t?.newToday ?? null, overdue: t?.overdue ?? 0,
      },
      {
        key: 'tickets', icon: TicketCheck, title: 'Tickets', noun: 'tickets', href: '/tickets', todayCounts: false, scope: 'team',
        isPending: tickets.isPending, isError: tickets.isError, onRetry: tickets.onRetry,
        total: k?.total ?? null, pending: k?.pending ?? null, completed: k?.completed ?? null, newToday: k?.newToday ?? null, overdue: k?.overdue ?? 0,
      },
      {
        key: 'checklist', icon: ClipboardCheck, title: 'Checklist', noun: 'checklists', href: '/checklists', todayCounts: true, scope: 'mine',
        isPending: checklist.isPending || checklistToday.isPending, isError: checklist.isError || checklistToday.isError,
        onRetry: () => { if (checklist.isError) checklist.onRetry(); if (checklistToday.isError) checklistToday.onRetry(); },
        total: ct?.total ?? null, pending: c?.pending ?? null, completed: ct?.completed ?? null, newToday: c?.newToday ?? null, overdue: c?.overdue ?? 0,
      },
      {
        key: 'todo', icon: ListTodo, title: 'To-do', noun: 'to-dos', href: '/todo', todayCounts: false, scope: 'mine',
        isPending: todos.isPending, isError: todos.isError, onRetry: todos.onRetry,
        total: d?.total ?? null, pending: d?.pending ?? null, completed: d?.completed ?? null, newToday: d?.newToday ?? null, overdue: d?.overdue ?? 0,
      },
    ];
  }, [tasks, tickets, todos, checklist, checklistToday]);

  const orgToday = useOrgToday();
  const month = windowFor('month', 0, orgToday);
  const asked = capWindowAtToday(month.from, month.to, orgToday);
  const monthScores = useQuery(scoreQuery('person', undefined, asked.from, asked.to));

  const drilldown = useMemo(() => {
    if (!openDrill) return null;
    const { key, kind } = openDrill;
    const view = views.find((v) => v.key === key)!;
    const today = startOfToday(now);
    const isNew = (iso: string) => new Date(iso).getTime() >= today;

    let rows: DrilldownRow[];
    if (key === 'delegation') {
      const pick = {
        pending: (x: Task) => !isTaskHandedIn(x) && x.status !== 'draft',
        completed: (x: Task) => isTaskHandedIn(x),
        newToday: (x: Task) => isNew(x.createdAt),
        overdue: (x: Task) => isTaskOverdue(x, now),
      }[kind];
      rows = taskList.filter((x) => x.category === 'delegation').filter(pick).map((x) => taskDrilldownRow(x, now));
    } else if (key === 'tickets') {
      const pick = {
        pending: (x: Ticket) => !isTicketHandedIn(x),
        completed: (x: Ticket) => isTicketHandedIn(x),
        newToday: (x: Ticket) => isNew(x.createdAt),
        overdue: (x: Ticket) => !isTicketHandedIn(x) && isTicketLate(x),
      }[kind];
      rows = ticketList.filter(pick).map((x) => ticketRow(x, now));
    } else if (key === 'checklist') {
      const live = (x: ChecklistInstance) => isChecklistLive(x, now);
      const pick = {
        pending: (x: ChecklistInstance) => live(x) && (!isChecklistDone(x) || x.verificationStatus === 'REJECTED' || x.verificationStatus === 'NOT_SUBMITTED'),
        completed: (x: ChecklistInstance) => isChecklistDone(x) && isNew(x.generatedAt),
        newToday: (x: ChecklistInstance) => live(x) && isNew(x.generatedAt),
        overdue: (x: ChecklistInstance) => live(x) && isInstanceOverdue(x, isChecklistDone(x)),
      }[kind];
      rows = checklistList.filter(pick).map((x) => checklistRow(x, now));
    } else {
      const pick = {
        pending: (x: Todo) => !x.completed,
        completed: (x: Todo) => x.completed,
        newToday: (x: Todo) => isNew(x.createdAt),
        overdue: (x: Todo) => !x.completed && !!x.dueDate && new Date(x.dueDate).getTime() < now,
      }[kind];
      rows = todoList.filter(pick).map((x) => todoRow(x, now));
    }

    if (kind !== 'completed') rows = [...rows].sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity));

    const counted = { pending: view.pending, completed: view.completed, newToday: view.newToday, overdue: view.overdue }[kind];
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const viewAllHref = kind === 'newToday' ? createdRangeHref(view.href, new Date(today), tomorrow) : VIEW_ALL_HREF[key][kind];

    return {
      title: kind === 'newToday' ? `New ${view.noun}` : `${DRILL_LABEL[kind]} ${view.noun}`,
      description: counted != null ? `${counted} ${DRILL_SUBTITLE(view, kind)}` : undefined,
      emptyTitle: EMPTY_TITLE[kind],
      emptyDescription: `No ${view.noun} ${EMPTY_REASON[kind]}.`,
      icon: view.icon,
      rows,
      total: counted ?? undefined,
      viewAllHref,
      viewAllLabel: `Open ${PAGE_NAME[key]}`,
    };
  }, [openDrill, views, now, taskList, ticketList, todoList, checklistList]);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {views.map((view) => (
          <ModuleCard
            key={view.key}
            view={view}
            score={scoreFor(view.key, monthScores.data, view)}
            scopeTag={simple ? undefined : SCOPE_TAG[view.scope]}
            onOpen={(kind) => setOpenDrill({ key: view.key, kind })}
          />
        ))}
      </div>

      {drilldown && (
        <DrilldownModal
          open
          onClose={() => setOpenDrill(null)}
          title={drilldown.title}
          description={drilldown.description}
          emptyTitle={drilldown.emptyTitle}
          emptyDescription={drilldown.emptyDescription}
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
