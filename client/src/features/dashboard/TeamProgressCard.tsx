import { memo, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Users, Info, ChevronDown, ArrowUpRight, Clock, AlertTriangle, CircleDashed, Loader, Eye, CheckCircle2 } from 'lucide-react';
import { RadialGauge, EntityIconTile } from '../../components';
import { CountUp } from '../../components/countUp';
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
    { key: 'todo', label: 'To do', rows: todo, dot: 'bg-text-muted', icon: CircleDashed, tone: 'bg-text-muted/15 text-text-secondary' },
    { key: 'in_progress', label: 'In progress', rows: inProgress, dot: 'bg-warning', icon: Loader, tone: 'bg-warning/15 text-warning' },
    { key: 'in_review', label: 'In review', rows: inReview, dot: 'bg-status-approve', icon: Eye, tone: 'bg-status-approve/15 text-status-approve' },
    { key: 'done', label: 'Done', rows: done, dot: 'bg-success', icon: CheckCircle2, tone: 'bg-success/15 text-success' },
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
    <section aria-labelledby="team-progress-heading" className={`@container ${DASHBOARD_CARD_CLASS} p-4 sm:p-6 lg:p-7 flex flex-col gap-5`}>
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

      {/* The picture first: the completion ring beside the split of the period's delegations (one
          proportional bar, then a row per stage). Stacks on a narrow card, side by side when wide. */}
      <div className="grid grid-cols-1 @lg:grid-cols-[auto_minmax(0,1fr)] items-center gap-5 @lg:gap-8">
        <button
          type="button"
          onClick={() => open('Done delegations', done, '/tasks')}
          aria-label={completionRate == null ? 'Completion rate: no data for this period' : `Completion rate ${completionRate}%, ${done.length} of ${total} done. Tap for the completed records.`}
          disabled={done.length === 0}
          className="flex flex-col items-center gap-1.5 justify-self-center rounded-2xl outline-none disabled:cursor-default cursor-pointer focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          <RadialGauge percent={completionRate ?? 0} size={150} variant="circle" gradientFrom={ringFill} gradientTo={ringFill}>
            <div className="flex flex-col items-center justify-center">
              {completionRate == null
                ? <span className="text-sm font-display font-bold text-text-muted">No data</span>
                : <span className="text-3xl font-display font-black tracking-tighter text-text tabular-nums">{completionRate}%</span>}
              <span className="text-xs font-display font-medium text-text-muted">completed</span>
            </div>
          </RadialGauge>
          <span className="text-xs font-medium text-text-muted">{done.length} of {total} done &middot; {PERIOD_LABEL[period].toLowerCase()}</span>
        </button>

        <div className="flex flex-col gap-3 min-w-0">
          {/* One bar, split by stage, so the balance of the work reads before any number does. */}
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-border/60" role="img" aria-label={tiles.map((t) => `${t.label} ${t.rows.length}`).join(', ')}>
            {total > 0 && tiles.map((tile) => (
              <span key={tile.key} className={`${tile.dot} h-full transition-[width] duration-500 motion-reduce:transition-none`} style={{ width: `${(tile.rows.length / total) * 100}%` }} />
            ))}
          </div>
          <ul className="flex flex-col">
            {tiles.map((tile) => (
              <li key={tile.key} className="border-b border-border/50 last:border-b-0">
                <button
                  type="button"
                  onClick={() => open(`${tile.label} delegations`, tile.rows, '/tasks')}
                  className="flex items-center gap-3 w-full min-h-11 px-1 -mx-1 rounded-lg text-left cursor-pointer transition-colors duration-150 hover:bg-surface-hover/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                >
                  <span aria-hidden="true" className={`flex items-center justify-center size-8 shrink-0 rounded-lg ${tile.tone}`}>
                    <tile.icon size={16} />
                  </span>
                  <span className="flex-1 text-sm font-display font-medium text-text-secondary">{tile.label}</span>
                  <span className="text-xs font-display font-medium text-text-muted tabular-nums">{total > 0 ? `${Math.round((tile.rows.length / total) * 100)}%` : ''}</span>
                  <span className="w-8 text-right text-base font-display font-bold tabular-nums text-text">{tile.rows.length}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* These two ignore the period: an overdue delegation is overdue whenever it was created. */}
      {/* These two ignore the period: an overdue delegation is overdue whenever it was created. Same
          stat-tile shape as the other dashboard stats: number and label on the left, tinted icon on the right. */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-display font-semibold text-text-muted">Right now, any date</p>
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2.5">
          {[
            { key: 'overdue', label: 'Overdue', rows: overdue, href: '/tasks?quickFilter=delayed', title: 'Overdue delegations', icon: AlertTriangle, tile: 'bg-danger/10 text-danger', value: 'text-danger', ring: 'hover:border-danger/40 focus-visible:ring-danger/40' },
            { key: 'due', label: 'Due today', rows: dueToday, href: '/tasks?quickFilter=pending', title: 'Due today', icon: Clock, tile: 'bg-warning/10 text-warning', value: 'text-warning', ring: 'hover:border-warning/40 focus-visible:ring-warning/40' },
          ].map((stat) => (
            <button
              key={stat.key}
              type="button"
              onClick={() => open(stat.title, stat.rows, stat.href)}
              className={`flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3.5 sm:p-4 text-left cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 ${stat.ring}`}
            >
              <span className="flex flex-col gap-1 min-w-0">
                <span className={`text-2xl sm:text-3xl font-display font-bold tabular-nums leading-none ${stat.value}`}><CountUp value={stat.rows.length} /></span>
                <span className="text-xs sm:text-sm font-display font-medium text-text-muted">{stat.label}</span>
              </span>
              <span aria-hidden="true" className={`flex items-center justify-center size-10 sm:size-11 shrink-0 rounded-xl ${stat.tile}`}>
                <stat.icon size={20} />
              </span>
            </button>
          ))}
        </div>
      </div>

      {needsHelp.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-display font-semibold text-text-muted">Needs help (most overdue)</p>
          <ul className="flex flex-col">
            {needsHelp.map((person) => (
              <li key={person.id} className="border-b border-border/50 last:border-b-0">
                <button
                  type="button"
                  onClick={() => open(`Overdue: ${person.name}`, person.list, '/tasks?quickFilter=delayed')}
                  className="flex items-center gap-3 w-full min-h-12 px-1 -mx-1 rounded-lg text-left cursor-pointer transition-colors duration-150 hover:bg-surface-hover/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                >
                  <span aria-hidden="true" className="flex items-center justify-center size-8 shrink-0 rounded-full bg-primary-700 text-white text-xs font-display font-bold dark:bg-primary-600">
                    {person.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                  </span>
                  <span className="flex-1 text-sm font-display font-medium text-text truncate">{person.name}</span>
                  <span className="text-sm font-display font-bold tabular-nums text-danger shrink-0">{person.list.length} overdue</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

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
