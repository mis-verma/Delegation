import { memo, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Users, Info, ChevronDown, ArrowUpRight, Clock, AlertTriangle } from 'lucide-react';
import { RadialGauge, EntityIconTile } from '../../components';
import { useAssignableUsersQuery } from '../tickets/hook';
import { Popover, PopoverTrigger, PopoverContent } from '../../components/ui/popover';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/dropdown-menu';
import { Separator } from '../../components/ui/separator';
import { useNow } from '../../lib/useNow';
import { DrilldownModal, type DrilldownRow } from './DrilldownModal';
import { DASHBOARD_CARD_CLASS, isTaskOverdue, rateTone, taskDrilldownRow, type RateTone } from './dashboardDisplay';
import type { Task } from '../../api/task';

interface TeamProgressCardProps {
  tasks: Task[];
  isOrgWideRole: boolean;
}

type ProgressPeriod = 'today' | 'yesterday' | '7d' | '30d' | '90d';

const PERIOD_LABEL: Record<ProgressPeriod, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
};
const PERIOD_ORDER: ProgressPeriod[] = ['today', 'yesterday', '7d', '30d', '90d'];

const DAY_MS = 86_400_000;
const startOfDay = (ms: number) => { const x = new Date(ms); x.setHours(0, 0, 0, 0); return x.getTime(); };

const periodRange = (period: ProgressPeriod, now: number): [number, number] => {
  if (period === 'today') { const s = startOfDay(now); return [s, s + DAY_MS]; }
  if (period === 'yesterday') { const s = startOfDay(now); return [s - DAY_MS, s]; }
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  return [now - days * DAY_MS, now];
};

// The ring is coloured by how the score reads, like the Completion and on-time card.
const RING_FILL: Record<RateTone, string> = {
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  neutral: 'var(--color-primary-700)',
};

type DrilldownState = { title: string; rows: DrilldownRow[]; href: string };

export const TeamProgressCard = memo(({ tasks, isOrgWideRole }: TeamProgressCardProps) => {
  const [period, setPeriod] = useState<ProgressPeriod>('7d');
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null);
  const now = useNow();

  // The three tiles and the gauge describe delegations created inside the chosen window. Overdue
  // and Due today do not: an overdue task is overdue whenever it was created, so they are counted
  // over every open task and never change with the period dropdown.
  const { todo, inProgress, inReview, done, total, overdue, dueToday } = useMemo(() => {
    const [start, end] = periodRange(period, now);
    const inPeriod = tasks.filter((t) => { const c = new Date(t.createdAt).getTime(); return c >= start && c < end; });
    const todayStart = startOfDay(now);
    return {
      todo: inPeriod.filter((t) => t.status === 'todo'),
      inProgress: inPeriod.filter((t) => t.status === 'in_progress'),
      // Handed in and waiting for a reviewer: its own tile, so work stuck with an approver is visible.
      inReview: inPeriod.filter((t) => t.status === 'pending_approval'),
      done: inPeriod.filter((t) => t.status === 'done'),
      total: inPeriod.length,
      overdue: tasks.filter((t) => isTaskOverdue(t, now)),
      dueToday: tasks.filter((t) => {
        if ((t.status !== 'todo' && t.status !== 'in_progress') || !t.dueDate) return false;
        const due = new Date(t.dueDate).getTime();
        return due >= todayStart && due < todayStart + DAY_MS;
      }),
    };
  }, [tasks, period, now]);

  const completionRate = total > 0 ? Math.round((done.length / total) * 100) : null;
  const ringFill = completionRate == null ? RING_FILL.neutral : RING_FILL[rateTone(completionRate, total)];

  const tiles = [
    { key: 'todo', label: 'To do', rows: todo, dot: 'bg-text-muted' },
    { key: 'in_progress', label: 'In progress', rows: inProgress, dot: 'bg-warning' },
    { key: 'in_review', label: 'In review', rows: inReview, dot: 'bg-status-approve' },
    { key: 'done', label: 'Done', rows: done, dot: 'bg-success' },
  ] as const;

  // Admin and PC: the three people with the most overdue delegations, so the card says who, not just
  // how many. Names come from the assignable-people list those roles already load elsewhere.
  const { data: people = [] } = useAssignableUsersQuery(undefined, undefined, undefined, isOrgWideRole);
  const needsHelp = useMemo(() => {
    if (!isOrgWideRole) return [];
    const byPerson = new Map<string, Task[]>();
    for (const t of overdue) {
      if (!t.assigneeId) continue;
      byPerson.set(t.assigneeId, [...(byPerson.get(t.assigneeId) ?? []), t]);
    }
    const nameOf = new Map(people.map((p) => [p.id, `${p.firstName}${p.lastName ? ` ${p.lastName}` : ''}`]));
    return [...byPerson.entries()]
      .map(([id, list]) => ({ id, name: nameOf.get(id) ?? 'Someone', list }))
      .sort((a, b) => b.list.length - a.list.length)
      .slice(0, 3);
  }, [isOrgWideRole, overdue, people]);

  const title = isOrgWideRole ? 'Team\u2019s progress' : 'Your progress';
  const reportHref = isOrgWideRole ? '/admin/reports' : '/tasks';
  const open = (title: string, list: Task[], href: string) => setDrilldown({ title, rows: list.map((t) => taskDrilldownRow(t, now)), href });

  return (
    <section aria-labelledby="team-progress-heading" className={`${DASHBOARD_CARD_CLASS} p-4 sm:p-6 lg:p-7 flex flex-col gap-4`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <EntityIconTile icon={Users} />
          <div className="flex items-center gap-1.5">
            <h2 id="team-progress-heading" className="text-base sm:text-lg font-display font-bold text-text tracking-tight leading-tight">
              {title}
            </h2>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="What this card shows"
                  className="flex items-center justify-center size-11 -m-2.5 rounded-full text-text-light hover:text-text hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 transition-colors duration-200 cursor-pointer"
                >
                  <Info size={14} />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 text-xs text-text-secondary leading-relaxed">
                <p className="font-display font-bold text-text mb-1.5">{title}</p>
                <p>How {isOrgWideRole ? 'your team\u2019s' : 'your'} delegations split across To do, In progress, In review and Done for the selected window, plus the completion rate. Overdue and Due today count every open delegation, whatever the window. Tap any figure for the records behind it.</p>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* The period picker sits up here, next to the numbers it changes. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Period: ${PERIOD_LABEL[period]}`}
              className="inline-flex items-center gap-1.5 min-h-11 sm:min-h-9 px-3 rounded-lg text-sm font-display font-medium text-text-secondary border border-border/60 hover:text-text hover:bg-surface-hover transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              {PERIOD_LABEL[period]}
              <ChevronDown size={14} strokeWidth={2.5} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            {PERIOD_ORDER.map((p) => (
              <DropdownMenuItem key={p} onClick={() => setPeriod(p)}>{PERIOD_LABEL[p]}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
        {tiles.map((tile) => (
          <button
            key={tile.key}
            type="button"
            onClick={() => open(`${tile.label} delegations`, tile.rows, '/tasks')}
            className="flex flex-col justify-center gap-1.5 min-h-16 sm:h-20 px-2.5 sm:px-3 rounded-xl border border-border/60 bg-surface-hover/30 transition-colors duration-200 cursor-pointer hover:bg-surface-hover hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <span className="flex items-center gap-1.5 text-[11px] font-display font-semibold text-text-muted whitespace-nowrap">
              <span className={`size-1.5 rounded-full shrink-0 ${tile.dot}`} />
              {tile.label}
            </span>
            <span className="text-xl font-display font-bold tabular-nums text-text">{tile.rows.length}</span>
          </button>
        ))}
      </div>

      {/* Always visible, on phones too: these two are the numbers someone opens this card to
          check, so they are not tucked behind a "show details" toggle. */}
      <p className="text-xs font-display font-semibold text-text-muted -mb-2">Right now, any date</p>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        <button
          type="button"
          onClick={() => open('Overdue delegations', overdue, '/tasks?quickFilter=delayed')}
          className="flex items-center justify-between gap-2 min-h-11 px-3 rounded-xl border border-danger/20 bg-danger/5 text-left cursor-pointer transition-colors duration-200 hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
        >
          <span className="flex items-center gap-1.5 text-[13px] font-display font-semibold text-text-secondary"><AlertTriangle size={13} className="text-danger shrink-0" /> Overdue</span>
          <span className="text-sm font-display font-bold tabular-nums text-danger">{overdue.length}</span>
        </button>
        <button
          type="button"
          onClick={() => open('Due today', dueToday, '/tasks?quickFilter=pending')}
          className="flex items-center justify-between gap-2 min-h-11 px-3 rounded-xl border border-warning/20 bg-warning/5 text-left cursor-pointer transition-colors duration-200 hover:bg-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/40"
        >
          <span className="flex items-center gap-1.5 text-[13px] font-display font-semibold text-text-secondary"><Clock size={13} className="text-warning shrink-0" /> Due today</span>
          <span className="text-sm font-display font-bold tabular-nums text-warning">{dueToday.length}</span>
        </button>
      </div>

      {needsHelp.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-display font-semibold text-text-muted">Needs help (most overdue)</p>
          {needsHelp.map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() => open(`Overdue: ${person.name}`, person.list, '/tasks?quickFilter=delayed')}
              className="flex items-center justify-between gap-2 min-h-11 px-3 rounded-xl border border-border/60 bg-surface-hover/30 text-left cursor-pointer transition-colors duration-200 hover:bg-surface-hover hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <span className="text-sm font-display font-medium text-text truncate">{person.name}</span>
              <span className="text-sm font-display font-bold tabular-nums text-danger shrink-0">{person.list.length} overdue</span>
            </button>
          ))}
        </div>
      )}

      {/* The same RadialGauge every other compliance-style chart on this dashboard uses. Tapping it
          opens the completed records, the same affordance the Compliance gauges use. */}
      <button
        type="button"
        onClick={() => open('Done delegations', done, '/tasks')}
        aria-label={completionRate == null ? 'Completion rate: no data for this period' : `Completion rate ${completionRate}%, ${done.length} of ${total} done. Tap for the completed records.`}
        disabled={done.length === 0}
        className="flex flex-col items-center gap-1 py-1 rounded-2xl outline-none disabled:cursor-default cursor-pointer focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        <RadialGauge percent={completionRate ?? 0} size={144} variant="circle" gradientFrom={ringFill} gradientTo={ringFill}>
          <div className="flex flex-col items-center justify-center">
            {completionRate == null
              ? <span className="text-sm font-display font-bold text-text-muted">No data</span>
              : <span className="text-xl font-display font-black tracking-tighter text-text">{completionRate}%</span>}
            <span className="text-xs font-display font-medium text-text-muted">Completion rate</span>
          </div>
        </RadialGauge>
        <span className="block text-xs font-medium text-text-muted">{done.length} of {total} done &middot; {PERIOD_LABEL[period].toLowerCase()}</span>
      </button>

      <Separator />

      <div className="flex items-center justify-end">
        <Link
          to={reportHref}
          className="inline-flex items-center gap-1.5 min-h-11 px-2 rounded-lg text-sm font-display font-semibold text-primary-600 dark:text-primary-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          {isOrgWideRole ? 'Progress report' : 'All delegations'}
          <ArrowUpRight size={14} strokeWidth={2.5} />
        </Link>
      </div>

      {drilldown && (
        <DrilldownModal
          open
          onClose={() => setDrilldown(null)}
          title={drilldown.title}
          icon={Users}
          rows={drilldown.rows}
          viewAllHref={drilldown.href}
          viewAllLabel="View all in Delegations"
        />
      )}
    </section>
  );
});

TeamProgressCard.displayName = 'TeamProgressCard';
