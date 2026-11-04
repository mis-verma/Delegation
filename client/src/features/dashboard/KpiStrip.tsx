import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, CheckCircle2, ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DrilldownModal, type DrilldownRow } from './DrilldownModal';
import { Skeleton } from '../../components/skeleton';
import { PANEL_CLASS } from '../../components/entityCard';
import { CountUp } from '../../components/countUp';
import { IconChip, InlineError, RadialGauge } from '../../components';
import { FigureCard } from './FigureCard';
import { DashCardLink } from './DashCardHeader';
import { CATEGORY_ACCENT, CATEGORY_ICON, CATEGORY_PILL } from './categoryLook';
import { useQuery } from '@tanstack/react-query';
import { scoreApi, type ScoreScope, type ScoreTrend, type Scores } from '../../api/scores';
import { useAuth } from '../../context/AuthContext';
import { useScoreExplorer } from '../scores/useScoreExplorer';
import { explorerRowToScores } from '../scores/explorerAdapters';
import { canUseScoreExplorer, teamScoreView } from '../scores/teamScoreView';
import { windowFor } from './scorePeriods';
import { shiftDay } from '../admin/analytics/analyticsDisplay';
import { SCORE_QUERY_OPTIONS, scoreQuery } from './scoreQueries';
import { HeatDots } from './HeatDots';
import { TONE_COLOR, toneOf } from './scoreTone';
import { moduleOverall } from './scoreMetrics';
import { capWindowAtToday } from '../scores/useScoreWindow';
import { HowCalculated } from '../scores/HowCalculated';
import type { ScoreModule } from '../../lib/scoreLabels';
import { useNow } from '../../lib/useNow';
import { useOrgToday } from '../checklist/useOrgToday';
import { describeDueBy, instanceDeadline, instanceOpensOnLaterDay, isInstanceEnded, isInstanceOverdue } from '../checklist/checklistDisplay';
import { doneLabel, dueLabel, isTaskOverdue, isTicketLate, taskDrilldownRow, type ActivityCategory } from './dashboardDisplay';
import { createdRangeHref } from '../../lib/createdRange';
import type { DashboardSummaries } from './useDashboardSummaries';
import { taskApi, type Task } from '../../api/task';
import { ticketApi, type Ticket } from '../../api/ticket';
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

const isLiveWork = (x: { awaitingHeadApproval?: boolean; declinedAt?: string | null }) => !x.awaitingHeadApproval && !x.declinedAt;

const startOfToday = (now: number) => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); };

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

const CATEGORY_OF: Record<ModuleKey, ActivityCategory> = { delegation: 'delegation', tickets: 'ticket', checklist: 'checklist', todo: 'todo' };

const OnTrack = ({ className }: { className?: string }) => (
  <IconChip icon={CheckCircle2} tone="bg-vivid-green" label="On track" labelClassName="text-vivid-green-text" className={cn('shrink-0 border-vivid-green/40 bg-vivid-green/10', className)} />
);

const ProgressBar = ({ done, overdue, open, openClass }: { done: number; overdue: number; open: number; openClass: string }) => {
  const span = Math.max(1, done + open);
  const late = Math.min(open, overdue);
  const pct = (n: number) => `${(n / span) * 100}%`;
  return (
    <div role="img" aria-label={`${done} done, ${open - late} open, ${late} overdue`} className="flex h-1.5 w-full overflow-hidden rounded-full bg-border/50">
      <span className="bar-grow h-full bg-vivid-green" style={{ width: pct(done) }} />
      <span className="bar-grow h-full bg-vivid-red" style={{ width: pct(late) }} />
      <span className={cn('bar-grow h-full', openClass)} style={{ width: pct(open - late) }} />
    </div>
  );
};

const SCORE_MODULE: Record<Exclude<ModuleKey, 'todo'>, ScoreModule> = { delegation: 'delegation', tickets: 'ticket', checklist: 'checklist' };

interface GaugeScore {
  value: number | null;
  label: string;
  owner: 'Team' | 'Your';
}

const scoreFor = (key: ModuleKey, personal: Scores | undefined, team: Scores | undefined, teamExpected: boolean, view: ModuleView): GaugeScore => {
  if (key === 'todo') return { value: view.total ? roundPct(((view.completed ?? 0) / view.total) * 100) : null, label: 'Done', owner: 'Your' };
  const isTeam = view.scope === 'team' && teamExpected;
  const owner = isTeam ? 'Team' : 'Your';
  const s = isTeam ? team : personal;
  if (!s) return { value: null, label: 'Score', owner };
  return { value: moduleOverall(s, SCORE_MODULE[key]), label: 'Score', owner };
};

const gaugeColor = (v: number | null) => (v === null ? 'var(--color-border-hover)' : TONE_COLOR[toneOf(v)]);

interface Spark {
  values: (number | null)[];
  labels: string[];
}

const NOTHING_DUE = 'Nothing due today';
const RETRY_LINE = 'relative inline-flex min-h-11 w-fit items-center rounded-md t-meta font-display font-semibold text-danger underline-offset-2 outline-none transition-colors duration-150 ease-out hover:underline focus-visible:ring-2 focus-visible:ring-danger/40 pointer-fine:min-h-6';
const TAP_PILL = 'inline-flex min-h-11 items-center rounded-full outline-none transition-transform duration-150 ease-out active:scale-[0.97] focus-visible:ring-2 pointer-fine:min-h-0';

const CompactTile = ({ view, failed, idle, refreshFailed }: { view: ModuleView; failed: boolean; idle: boolean; refreshFailed: boolean }) => {
  const category = CATEGORY_OF[view.key];
  const Icon = CATEGORY_ICON[category];
  const late = view.overdue;
  const spoken = failed
    ? `${view.title}, couldn't load`
    : idle
      ? `${view.title}, ${NOTHING_DUE.toLowerCase()}`
      : `${view.title}, ${view.pending ?? 0} pending, ${late > 0 ? `${late} late` : 'nothing late'}`;
  return (
    <div className="relative flex min-w-0 flex-col gap-1.5 rounded-lg border border-border/60 bg-surface p-3 transition-colors duration-150 ease-out hover:border-border-hover active:scale-[0.985] sm:hidden">
      <Link viewTransition to={view.href} aria-label={`Open ${PAGE_NAME[view.key]}: ${spoken}`} className="absolute inset-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40" />
      <span className="pointer-events-none relative flex min-w-0 items-center gap-1.5" aria-hidden="true">
        <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md', CATEGORY_PILL[category])}>
          <Icon className="size-4" strokeWidth={2.25} />
        </span>
        <span className="min-w-0 line-clamp-2 break-words leading-snug t-card font-display font-bold text-text">{view.title}</span>
      </span>
      {failed ? (
        <>
          <span className="pointer-events-none relative t-meta text-text-muted" aria-hidden="true">Couldn't load.</span>
          <button type="button" onClick={view.onRetry} className={RETRY_LINE}>Retry</button>
        </>
      ) : idle ? (
        <span className="pointer-events-none relative flex flex-col gap-0.5" aria-hidden="true">
          <span className="t-meta font-semibold text-text-muted">{NOTHING_DUE}</span>
          <span className="t-meta font-display font-semibold text-primary-700 dark:text-primary-300">Open {PAGE_NAME[view.key]}</span>
        </span>
      ) : (
        <>
          <span className="pointer-events-none relative flex items-baseline gap-1" aria-hidden="true">
            <span className="t-stat font-display font-bold leading-none tabular-nums text-text"><CountUp value={view.pending ?? 0} fromZero /></span>
            <span className="t-meta text-text-muted">pending</span>
          </span>
          <span className={cn('pointer-events-none relative t-meta font-semibold', late > 0 ? 'text-danger' : 'text-text-muted')} aria-hidden="true">
            {late > 0 ? `${late} late` : 'Nothing late'}
          </span>
        </>
      )}
      {refreshFailed && (
        <button type="button" onClick={view.onRetry} className={RETRY_LINE}>Couldn't refresh. Retry</button>
      )}
    </div>
  );
};

const ModuleCard = ({ view, onOpen, score, scopeTag, index, spark }: { view: ModuleView; onOpen: (kind: DrillKind) => void; score: GaugeScore; scopeTag?: string; index: number; spark?: Spark }) => {
  const category = CATEGORY_OF[view.key];
  const Icon = CATEGORY_ICON[category];
  if (view.isPending) {
    return (
      <>
        <div className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-surface p-3 sm:hidden" role="status" aria-label={`Loading ${view.noun}`}>
          <div className="flex items-center gap-1.5">
            <Skeleton className="size-7 shrink-0 rounded-md" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-6 w-12" />
          <Skeleton className="h-3.5 w-20" />
        </div>
        <div className={cn(PANEL_CLASS, 'hidden flex-col gap-3 p-4 sm:flex')} role="status" aria-label={`Loading ${view.noun}`}>
          <div className="flex h-9 items-center gap-2">
            <Skeleton className="size-9 shrink-0 rounded-lg" />
            <Skeleton className="h-5 w-24" />
          </div>
          <Skeleton className="h-28 w-full rounded-xl" />
          <div className="grid grid-cols-3 gap-1.5">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        </div>
      </>
    );
  }
  const hasData = view.pending != null;
  const failed = !hasData;
  const refreshFailed = hasData && view.isError;
  const idle = hasData && (view.total ?? 0) === 0 && (view.pending ?? 0) === 0 && (view.completed ?? 0) === 0 && (view.newToday ?? 0) === 0 && view.overdue === 0;
  const scoreModule = view.key === 'todo' ? null : SCORE_MODULE[view.key];
  const gaugeName = score.label === 'Done' ? 'To-dos done' : `${score.owner} score today`;
  return (
    <>
      <CompactTile view={view} failed={failed} idle={idle} refreshFailed={refreshFailed} />
      <section
        aria-label={scopeTag ? `${view.title}, ${scopeTag.toLowerCase()}` : view.title}
        style={{ '--stat-delay': `${index * 70}ms` } as CSSProperties}
        className={cn(PANEL_CLASS, '@container stat-rise hidden min-w-0 flex-col gap-3 p-4 transition-colors duration-150 ease-out hover:border-border-hover sm:flex')}
      >
        <Link
          viewTransition
          to={view.href}
          aria-label={`Open ${view.title}`}
          className="group flex min-h-11 items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-fine:min-h-9"
        >
          <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', CATEGORY_PILL[category])}>
            <Icon className="size-[1.125rem]" strokeWidth={2.25} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <h3 className="line-clamp-2 break-words leading-snug t-card font-display font-bold text-text">{view.title}</h3>
            {scopeTag && <span className="block t-meta text-text-muted">{scopeTag}{view.todayCounts ? ' · today' : ' · all time'}</span>}
          </span>
          <span className="inline-flex shrink-0 items-center gap-0.5 t-meta font-display font-semibold text-primary-600 dark:text-primary-400">
            <span className="group-hover:underline">View all</span>
            <ChevronRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </Link>

        {failed ? (
          <InlineError message={`Couldn't load ${view.noun}.`} onRetry={view.onRetry} />
        ) : idle ? (
          <div className="flex min-h-28 flex-1 flex-col items-start justify-center gap-2 rounded-lg border border-border/60 px-3 py-4">
            <p className="t-card font-display font-semibold text-text-secondary">{NOTHING_DUE}</p>
            <DashCardLink to={view.href} label={`Open ${PAGE_NAME[view.key]}`}>Open {PAGE_NAME[view.key]}</DashCardLink>
          </div>
        ) : (
          <>
            <div className="grid min-h-[7.75rem] grid-cols-2 items-center gap-2">
              <div className="flex min-w-0 flex-col items-start gap-1.5">
                <button type="button" onClick={() => onOpen('pending')} className="flex min-h-11 flex-col items-start rounded-lg px-1 py-0.5 text-left outline-none transition-colors duration-150 ease-out hover:bg-surface-hover/60 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary-500/40">
                  <span className="t-stat font-display font-bold leading-none tabular-nums text-text">
                    <CountUp value={view.pending ?? 0} fromZero />
                  </span>
                  <span className="t-meta font-semibold text-text-muted">Pending now</span>
                </button>
                {view.overdue > 0 ? (
                  <button type="button" onClick={() => onOpen('overdue')} className={cn(TAP_PILL, 'focus-visible:ring-danger/40')}>
                    <IconChip icon={AlertTriangle} tone="bg-vivid-red" label={`${view.overdue} overdue`} labelClassName="tabular-nums text-vivid-red-text" className="border-vivid-red/40 bg-vivid-red/10" />
                  </button>
                ) : (
                  <OnTrack />
                )}
              </div>
              {score.value === null ? (
                <div className="flex h-full min-h-24 flex-col items-center justify-center gap-1 border-l border-border/60 px-2 text-center">
                  <span className="t-meta font-semibold text-text-muted">{score.label === 'Done' ? 'No to-dos yet' : 'No score yet today'}</span>
                  <span className="t-meta text-text-muted">{score.label === 'Done' ? 'Add one on the To-do page' : 'It shows once work comes due'}</span>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-1 border-l border-border/60">
                  <RadialGauge percent={score.value} size={84} variant="circle" ariaLabel={`${gaugeName} ${formatPct(score.value)}`} gradientFrom={gaugeColor(score.value)} gradientTo={gaugeColor(score.value)}>
                    <span className="t-stat font-display font-bold tabular-nums text-text">{formatPct(score.value)}</span>
                  </RadialGauge>
                  <span className="flex min-h-[2.8em] items-center justify-center gap-0.5 text-center t-meta font-semibold text-text-muted">
                    {gaugeName}
                    {scoreModule && <HowCalculated figure="overall" module={scoreModule} />}
                  </span>
                </div>
              )}
            </div>

            {spark && spark.values.some((v) => v !== null) && (
              <div className="flex flex-col gap-1">
                <span className="t-meta font-medium text-text-muted">Last 7 days</span>
                <HeatDots values={spark.values} labels={spark.labels} />
              </div>
            )}

            <ProgressBar done={view.completed ?? 0} overdue={view.overdue} open={view.pending ?? 0} openClass={CATEGORY_ACCENT[category]} />

            <div className="grid grid-cols-3 gap-1.5">
              <FigureCard label="Done" value={view.completed} tone="plain" loading={false} onClick={() => onOpen('completed')} />
              <FigureCard label="New today" short="New" value={view.newToday} tone="plain" loading={false} onClick={() => onOpen('newToday')} />
              <FigureCard label="Total" value={view.total} tone="plain" loading={false} />
            </div>

            {refreshFailed && (
              <button type="button" onClick={view.onRetry} className={RETRY_LINE}>Couldn't refresh. Retry</button>
            )}
          </>
        )}
      </section>
    </>
  );
};

const SCOPE_TAG: Record<ModuleView['scope'], string> = { team: 'Your team', mine: 'Only you' };
const ORG_SCOPE_TAG = 'Everyone';

export const KpiStrip = ({ summaries, taskList, ticketList, todoList, checklistList, simple = false }: KpiStripProps) => {
  const now = useNow();
  const [openDrill, setOpenDrill] = useState<{ key: ModuleKey; kind: DrillKind } | null>(null);
  const { tasks, tickets, todos, checklistToday } = summaries;

  const views = useMemo<ModuleView[]>(() => {
    const t = tasks.data;
    const k = tickets.data;
    const d = todos.data;
    const ct = checklistToday.data;
    return [
      {
        key: 'delegation', icon: CATEGORY_ICON.delegation, title: 'Delegation', noun: 'delegations', href: '/tasks', todayCounts: false, scope: 'team',
        isPending: tasks.isPending, isError: tasks.isError, onRetry: tasks.onRetry,
        total: t?.total ?? null, pending: t?.pending ?? null, completed: t?.completed ?? null, newToday: t?.newToday ?? null, overdue: t?.overdue ?? 0,
      },
      {
        key: 'tickets', icon: CATEGORY_ICON.ticket, title: 'Tickets', noun: 'tickets', href: '/tickets', todayCounts: false, scope: 'team',
        isPending: tickets.isPending, isError: tickets.isError, onRetry: tickets.onRetry,
        total: k?.total ?? null, pending: k?.pending ?? null, completed: k?.completed ?? null, newToday: k?.newToday ?? null, overdue: k?.overdue ?? 0,
      },
      {
        key: 'checklist', icon: CATEGORY_ICON.checklist, title: 'Checklist', noun: 'checklists', href: '/checklists', todayCounts: true, scope: 'mine',
        isPending: checklistToday.isPending, isError: checklistToday.isError,
        onRetry: checklistToday.onRetry,
        total: ct?.total ?? null, pending: ct?.pending ?? null, completed: ct?.completed ?? null, newToday: ct?.newToday ?? null, overdue: ct?.overdue ?? 0,
      },
      {
        key: 'todo', icon: CATEGORY_ICON.todo, title: 'To-do', noun: 'to-dos', href: '/todo', todayCounts: false, scope: 'mine',
        isPending: todos.isPending, isError: todos.isError, onRetry: todos.onRetry,
        total: d?.total ?? null, pending: d?.pending ?? null, completed: d?.completed ?? null, newToday: d?.newToday ?? null, overdue: d?.overdue ?? 0,
      },
    ];
  }, [tasks, tickets, todos, checklistToday]);

  const orgToday = useOrgToday();
  const day = windowFor('day', 0, orgToday);
  const asked = capWindowAtToday(day.from, day.to, orgToday);
  const { user } = useAuth();
  const todayScores = useQuery(scoreQuery('person', undefined, asked.from, asked.to));
  const teamExpected = !simple && canUseScoreExplorer(user?.role);
  const orgWideViewer = user?.role === 'ADMIN' || user?.role === 'PC' || user?.role === 'OWNER';
  const teamExplorer = useScoreExplorer(teamExpected ? { from: asked.from, to: asked.to, view: teamScoreView(user?.role) } : null);
  const teamScores = useMemo(
    () => (teamExplorer.data ? explorerRowToScores(teamExplorer.data.total, teamExplorer.data.scope.orgWide ? 'org' : 'department', { from: asked.from, to: asked.to }) : undefined),
    [teamExplorer.data, asked.from, asked.to],
  );

  const trendFrom = shiftDay(asked.to, -6);
  const personalTrend = useQuery<ScoreTrend>({
    queryKey: ['scores', 'trend', 'person', 'me', 'day', trendFrom, asked.to],
    queryFn: () => scoreApi.trend({ scope: 'person', period: 'day', from: trendFrom, to: asked.to }),
    enabled: !!user,
    ...SCORE_QUERY_OPTIONS,
  });
  const teamTarget: { scope: ScoreScope; id?: string } | null = !teamExpected ? null : orgWideViewer ? { scope: 'org' } : user?.departmentId ? { scope: 'department', id: user.departmentId } : null;
  const teamTrend = useQuery<ScoreTrend>({
    queryKey: ['scores', 'trend', teamTarget?.scope ?? 'org', teamTarget?.id ?? 'me', 'day', trendFrom, asked.to],
    queryFn: () => scoreApi.trend({ scope: teamTarget?.scope ?? 'org', id: teamTarget?.id, period: 'day', from: trendFrom, to: asked.to }),
    enabled: !!teamTarget,
    ...SCORE_QUERY_OPTIONS,
  });
  const sparkOf = (key: ModuleKey): Spark | undefined => {
    if (key === 'todo') return undefined;
    const source = (key === 'delegation' || key === 'tickets') && teamTarget ? teamTrend.data : personalTrend.data;
    if (!source) return undefined;
    const module = SCORE_MODULE[key];
    return { values: source.buckets.map((b) => (b[module].due > 0 ? b[module].score : null)), labels: source.buckets.map((b) => b.label) };
  };

  const remoteDrill = useQuery({
    queryKey: ['dashboard-drill', openDrill?.key, openDrill?.kind] as const,
    enabled: !!openDrill && (openDrill.key === 'tickets' || openDrill.key === 'delegation') && user?.role !== 'USER' && user?.role !== 'AGENT',
    staleTime: 15_000,
    queryFn: async () => {
      const { key, kind } = openDrill!;
      const bucket = ({ pending: 'pending', completed: 'completed', overdue: 'delayed', newToday: undefined } as const)[kind];
      const createdFrom = kind === 'newToday' ? startOfToday(Date.now()) : undefined;
      if (key === 'tickets') {
        const page = await ticketApi.getPage({ page: 1, limit: 200, bucket, createdFrom });
        return { tickets: page.data, tasks: null };
      }
      const page = await taskApi.getPage({ page: 1, limit: 200, bucket, category: 'delegation', createdFrom });
      return { tickets: null, tasks: page.data };
    },
  });
  const remoteTickets = remoteDrill.data?.tickets ?? null;
  const remoteTasks = remoteDrill.data?.tasks ?? null;

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
      rows = (remoteTasks ?? taskList).filter((x) => x.category === 'delegation' && isLiveWork(x)).filter(pick).map((x) => taskDrilldownRow(x, now));
    } else if (key === 'tickets') {
      const pick = {
        pending: (x: Ticket) => !isTicketHandedIn(x),
        completed: (x: Ticket) => isTicketHandedIn(x),
        newToday: (x: Ticket) => isNew(x.createdAt),
        overdue: (x: Ticket) => !isTicketHandedIn(x) && isTicketLate(x),
      }[kind];
      rows = (remoteTickets ?? ticketList).filter(isLiveWork).filter(pick).map((x) => ticketRow(x, now));
    } else if (key === 'checklist') {
      const live = (x: ChecklistInstance) => isChecklistLive(x, now);
      const pick = {
        pending: (x: ChecklistInstance) => live(x) && (!isChecklistDone(x) || x.verificationStatus === 'REJECTED' || x.verificationStatus === 'NOT_SUBMITTED'),
        completed: (x: ChecklistInstance) => isChecklistDone(x) && isNew(x.generatedAt),
        newToday: (x: ChecklistInstance) => live(x) && isNew(x.generatedAt),
        overdue: (x: ChecklistInstance) => !instanceOpensOnLaterDay(x, now) && (instanceDeadline(x) ?? 0) >= startOfToday(now) && isInstanceOverdue(x, isChecklistDone(x)),
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
  }, [openDrill, views, now, taskList, ticketList, todoList, checklistList, remoteTickets, remoteTasks]);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {views.map((view, index) => (
          <ModuleCard
            key={view.key}
            index={index}
            view={view}
            score={scoreFor(view.key, todayScores.data, teamScores, teamExpected, view)}
            spark={sparkOf(view.key)}
            scopeTag={simple ? undefined : view.scope === 'team' && orgWideViewer ? ORG_SCOPE_TAG : SCOPE_TAG[view.scope]}
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
