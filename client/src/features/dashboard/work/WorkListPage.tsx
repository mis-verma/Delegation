import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlarmClock, ArrowLeft, CalendarClock, ChevronRight, Clock3, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, IconChip, InlineError, PANEL_CLASS, Skeleton, SlidingTabs, ToggleChip, type SlidingTabOption } from '../../../components';
import { useAuth } from '../../../context/AuthContext';
import { OWN_SCOPE_ROLES } from '../../../api/auth';
import { dashboardApi, type WorkGroup, type WorkKind, type WorkMetric, type WorkRow } from '../../../api/dashboard';
import { handleQueryRetry } from '../../../lib/queryHelpers';
import { haptic } from '../../../lib/haptics';
import { todayPeriodBoundIso } from '../../checklist/checklistDisplay';
import { CATEGORY_ICON, CATEGORY_TILE } from '../categoryLook';
import { useDashboardSummaries } from '../useDashboardSummaries';
import { WORK_METRIC_LOOK, isWorkMetric, metricValue, moduleListHref, type WorkScope } from './workMetrics';

const KIND_LABEL: Record<WorkKind, string> = {
  delegation: 'Delegation',
  ticket: 'Tickets',
  checklist: 'Checklists, today',
  todo: 'To-do',
};

const KIND_ICON_KEY: Record<WorkKind, keyof typeof CATEGORY_ICON> = {
  delegation: 'delegation',
  ticket: 'ticket',
  checklist: 'checklist',
  todo: 'todo',
};

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const whenText = (at: Date, now: Date) => {
  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (sameDay(at, now)) return `today ${time}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (sameDay(at, tomorrow)) return `tomorrow ${time}`;
  return `${at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${time}`;
};

const dueOf = (row: WorkRow, now: Date): { text: string; tone: string; icon: typeof Clock3 } | null => {
  if (row.dueAt) {
    const at = new Date(row.dueAt);
    return row.late
      ? { text: `Late, was due ${whenText(at, now)}`, tone: 'bg-danger', icon: AlarmClock }
      : { text: `Due ${whenText(at, now)}`, tone: 'bg-success', icon: CalendarClock };
  }
  if (row.dueText) return { text: row.late ? `Late, ${row.dueText.toLowerCase()}` : row.dueText, tone: row.late ? 'bg-danger' : 'bg-success', icon: row.late ? AlarmClock : Clock3 };
  return row.late ? { text: 'Late', tone: 'bg-danger', icon: AlarmClock } : null;
};

const RowLink = ({ row, now }: { row: WorkRow; now: Date }) => {
  const due = dueOf(row, now);
  return (
    <li>
      <Link
        to={row.href}
        viewTransition
        className="group flex min-h-14 items-center gap-3 px-4 py-3 outline-none transition-colors duration-150 hover:bg-surface-hover/50 focus-visible:bg-surface-hover active:bg-surface-hover sm:px-5"
      >
        <span className={cn('h-9 w-1 shrink-0 rounded-full', row.late ? 'bg-danger' : 'bg-border')} aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="t-card font-display font-semibold leading-snug text-text line-clamp-2 break-words">{row.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {row.subtitle && <span className="t-meta text-text-muted truncate">{row.subtitle}</span>}
            {due && <IconChip icon={due.icon} tone={due.tone} label={due.text} className="sm:hidden" />}
          </span>
        </span>
        {due && <IconChip icon={due.icon} tone={due.tone} label={due.text} className="hidden shrink-0 sm:inline-flex" />}
        <ChevronRight size={16} className="shrink-0 text-text-light transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>
    </li>
  );
};

const GroupSection = ({ group, metric, team, now, onRetry }: { group: WorkGroup; metric: WorkMetric; team: boolean; now: Date; onRetry: () => void }) => {
  const { user } = useAuth();
  const Icon = CATEGORY_ICON[KIND_ICON_KEY[group.kind]];
  const fullList = moduleListHref(group.kind, metric, team, user?.id);
  const more = group.total - group.rows.length;
  return (
    <section aria-label={KIND_LABEL[group.kind]} className={cn(PANEL_CLASS, 'flex flex-col overflow-hidden')}>
      <header className="flex items-center gap-3 border-b border-border/50 px-4 py-3 sm:px-5">
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg text-white', CATEGORY_TILE[KIND_ICON_KEY[group.kind]])} aria-hidden="true">
          <Icon size={16} strokeWidth={2.4} />
        </span>
        <h2 className="min-w-0 flex-1 truncate t-card font-display font-bold text-text">{KIND_LABEL[group.kind]}</h2>
        <span className="t-card font-figure font-extrabold tabular-nums text-text">{group.failed ? '-' : group.total}</span>
        <Link to={fullList} viewTransition className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 t-meta font-display font-semibold text-primary-700 outline-none transition-colors duration-150 hover:bg-primary-500/10 focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:text-primary-300 sm:min-h-8">
          Open list
          <ChevronRight size={14} aria-hidden="true" />
        </Link>
      </header>
      {group.failed ? (
        <div className="p-4 sm:p-5"><InlineError message={`We couldn't load ${KIND_LABEL[group.kind].toLowerCase()}.`} onRetry={onRetry} /></div>
      ) : group.rows.length === 0 ? (
        <p className="px-4 py-4 t-meta text-text-muted sm:px-5">Nothing here.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/50">
          {group.rows.map((row) => <RowLink key={row.id} row={row} now={now} />)}
        </ul>
      )}
      {more > 0 && (
        <Link to={fullList} viewTransition className="flex min-h-11 items-center justify-center gap-1 border-t border-border/50 t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 hover:bg-surface-hover/50 hover:text-text focus-visible:bg-surface-hover">
          {more} more in {KIND_LABEL[group.kind]}
          <ChevronRight size={14} aria-hidden="true" />
        </Link>
      )}
    </section>
  );
};

const LoadingGroups = () => (
  <div className="flex flex-col gap-4" aria-label="Loading" role="status">
    {[0, 1].map((g) => (
      <div key={g} className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-4 sm:p-5')}>
        <Skeleton className="h-6 w-40 rounded-md" />
        {[0, 1, 2].map((r) => <Skeleton key={r} className="h-12 w-full rounded-lg" />)}
      </div>
    ))}
  </div>
);

export const WorkListPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const ownOnly = !!user && OWN_SCOPE_ROLES.includes(user.role);
  const metricParam = params.get('metric');
  const metric: WorkMetric = isWorkMetric(metricParam) ? metricParam : 'pending';
  const scope: WorkScope = ownOnly || params.get('scope') !== 'visible' ? 'mine' : 'visible';
  const [kind, setKind] = useState<'all' | WorkKind>('all');
  const today = todayPeriodBoundIso();
  const now = useMemo(() => new Date(), []);

  const query = useQuery({
    queryKey: ['dashboard', 'work-items', metric, scope, today] as const,
    queryFn: () => dashboardApi.workItems({ metric, scope, today }),
    retry: handleQueryRetry,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

  const { kpi } = useDashboardSummaries(scope);
  const counts = useMemo(() => {
    const checklist = scope === 'mine' ? kpi.checklistToday.data : kpi.scopeChecklistToday.data ?? kpi.checklistToday.data;
    const sources = [kpi.tasks.data, kpi.tickets.data, checklist, scope === 'mine' ? kpi.todos.data : undefined];
    const anyLoaded = sources.some(Boolean);
    return Object.fromEntries(WORK_METRIC_LOOK.map((m) => [m.key, anyLoaded ? sources.reduce((sum, s) => sum + metricValue(s, m.key), 0) : undefined])) as Record<WorkMetric, number | undefined>;
  }, [kpi, scope]);

  const look = WORK_METRIC_LOOK.find((m) => m.key === metric) ?? WORK_METRIC_LOOK[1];
  const team = scope === 'visible';
  const whose = scope === 'mine' ? 'Your own work' : user?.role === 'ADMIN' || user?.role === 'PC' ? "Everyone's work" : "Your team's work";
  const groups = query.data && query.data.metric === metric ? query.data.groups : undefined;
  const shownGroups = groups ? (kind === 'all' ? groups : groups.filter((g) => g.kind === kind)) : undefined;
  const pageTotal = groups ? groups.reduce((sum, g) => sum + g.total, 0) : counts[metric];

  const metricOptions: readonly SlidingTabOption<WorkMetric>[] = WORK_METRIC_LOOK.map((m) => ({
    value: m.key,
    label: m.label,
    icon: m.icon,
    badge: counts[m.key],
    badgeTone: m.key === 'delayed' ? 'danger' : 'primary',
  }));

  const pickMetric = (next: WorkMetric) => {
    if (next === metric) return;
    haptic('tap');
    setKind('all');
    setParams((prev) => {
      const out = new URLSearchParams(prev);
      out.set('metric', next);
      return out;
    }, { replace: true });
  };

  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/', { replace: true }));

  return (
    <div className="view-enter flex w-full max-w-4xl flex-col gap-4 pt-2.5 mx-auto sm:gap-5">
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-surface text-text-secondary outline-none transition-colors duration-150 hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.97] sm:size-10 cursor-pointer"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="t-section font-display font-bold text-text">{look.label}</h1>
          <p className="t-meta text-text-muted">{whose} · {look.caption.toLowerCase()}</p>
        </div>
        <span className={cn('t-figure font-figure font-extrabold tabular-nums', metric === 'delayed' && (pageTotal ?? 0) > 0 ? 'text-danger' : 'text-text')} aria-label={`${pageTotal ?? 0} in total`}>
          {pageTotal ?? '-'}
        </span>
      </header>

      <SlidingTabs label="Which numbers" value={metric} options={metricOptions} onChange={pickMetric} fill="phone" size="sm" className="max-sm:w-full sm:self-start" />

      {groups && groups.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
          <ToggleChip on={kind === 'all'} onClick={() => setKind('all')}>All <span className="tabular-nums">{pageTotal}</span></ToggleChip>
          {groups.map((g) => (
            <ToggleChip key={g.kind} on={kind === g.kind} onClick={() => setKind(g.kind)}>
              {KIND_LABEL[g.kind]} <span className="tabular-nums">{g.failed ? '-' : g.total}</span>
            </ToggleChip>
          ))}
        </div>
      )}

      {query.isError && !groups ? (
        <InlineError message="We couldn't load this list. Check your connection and try again." onRetry={() => void query.refetch()} />
      ) : !shownGroups ? (
        <LoadingGroups />
      ) : shownGroups.every((g) => g.total === 0 && !g.failed) ? (
        <EmptyState
          icon={Inbox}
          tone="success"
          title={metric === 'delayed' ? 'Nothing is late' : 'Nothing here'}
          description={metric === 'delayed' ? 'Everything open is still on time.' : 'There is no work in this view right now.'}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {shownGroups.filter((g) => g.total > 0 || g.failed).map((g) => (
            <GroupSection key={g.kind} group={g} metric={metric} team={team} now={now} onRetry={() => void query.refetch()} />
          ))}
        </div>
      )}
    </div>
  );
};
