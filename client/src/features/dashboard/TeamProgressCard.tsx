import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Users, Info, ChevronDown, ArrowUpRight, ArrowDownRight, Clock, AlertTriangle } from 'lucide-react';
import { RadialGauge } from '../../components';
import { Popover, PopoverTrigger, PopoverContent } from '../../components/ui/popover';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/dropdown-menu';
import { DrilldownModal, type DrilldownRow } from './DrilldownModal';
import type { Task } from '../../api/task';

interface TeamProgressCardProps {
  /** Same workflow-scoped list KpiStrip's Process & Workflow card uses — org-wide for ADMIN/PC,
   *  "mine" otherwise — so this card's counts always agree with that one. */
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

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

const periodRange = (period: ProgressPeriod, now: Date): [Date, Date] => {
  if (period === 'today') { const s = startOfDay(now); return [s, new Date(s.getTime() + 86_400_000)]; }
  if (period === 'yesterday') { const s = startOfDay(now); return [new Date(s.getTime() - 86_400_000), s]; }
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  return [new Date(now.getTime() - days * 86_400_000), now];
};

const taskRow = (t: Task): DrilldownRow => ({
  id: t.id,
  title: t.title,
  link: `/tasks?open=${t.id}`,
  createdAt: t.createdAt,
  completed: t.status === 'done',
  overdue: t.status !== 'done' && !!t.dueDate && new Date(t.dueDate).getTime() < Date.now(),
});

/**
 * The "Your team's progress" card from the design brief, adapted to this app's own vocabulary —
 * there's no sprint or scheduled meeting concept here, so those two detail rows became "Overdue"
 * and "Due today" instead, and the ApexCharts radial chart is the same RadialGauge every other
 * compliance-style chart on this dashboard already uses rather than a second charting library.
 */
export const TeamProgressCard = ({ tasks, isOrgWideRole }: TeamProgressCardProps) => {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<ProgressPeriod>('7d');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [drilldown, setDrilldown] = useState<{ title: string; rows: DrilldownRow[]; href: string } | null>(null);

  // Read once per mount rather than inline (same pattern HomePage uses for its own `now`) — a
  // bare `Date.now()`/`new Date()` call during render is an impure read that can produce a
  // different result on every re-render.
  // eslint-disable-next-line react-hooks/purity
  const now = useMemo(() => Date.now(), []);
  const nowDate = useMemo(() => new Date(now), [now]);

  const [start, end] = periodRange(period, nowDate);
  const inPeriod = tasks.filter((t) => { const c = new Date(t.createdAt).getTime(); return c >= start.getTime() && c < end.getTime(); });

  const todo = inPeriod.filter((t) => t.status === 'todo');
  const inProgress = inPeriod.filter((t) => t.status === 'in_progress' || t.status === 'pending_verification');
  const done = inPeriod.filter((t) => t.status === 'done');
  const total = inPeriod.length;
  const completionRate = total > 0 ? Math.round((done.length / total) * 100) : 0;

  const overdue = inPeriod.filter((t) => t.status !== 'done' && !!t.dueDate && new Date(t.dueDate).getTime() < now);
  const dueToday = inPeriod.filter((t) => {
    if (t.status === 'done' || !t.dueDate) return false;
    const d = new Date(t.dueDate).getTime();
    const todayStart = startOfDay(nowDate).getTime();
    return d >= todayStart && d < todayStart + 86_400_000;
  });

  const TILES = [
    { key: 'todo', label: 'To do', count: todo.length, rows: todo, tone: 'bg-primary-50 dark:bg-primary-500/10 border-primary-100 dark:border-primary-800/50 text-primary-700 dark:text-primary-400', badge: 'bg-primary-100 dark:bg-primary-500/20 text-primary-700 dark:text-primary-300' },
    { key: 'in_progress', label: 'In progress', count: inProgress.length, rows: inProgress, tone: 'bg-warning/5 border-warning/20 text-warning', badge: 'bg-warning/15 text-warning' },
    { key: 'done', label: 'Done', count: done.length, rows: done, tone: 'bg-success/5 border-success/20 text-success', badge: 'bg-success/15 text-success' },
  ] as const;

  const reportHref = isOrgWideRole ? '/admin/reports' : '/tasks';

  return (
    <section aria-labelledby="team-progress-heading" className="rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface p-4 sm:p-6 lg:p-7 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary-50 dark:bg-primary-500/10 border border-primary-100 dark:border-primary-800/50 text-primary-600 dark:text-primary-400 shadow-sm">
            <Users size={20} strokeWidth={2.5} />
          </div>
          <div className="flex items-center gap-1.5">
            <h2 id="team-progress-heading" className="text-base sm:text-lg font-display font-bold text-text tracking-tight leading-tight">
              Team&rsquo;s progress
            </h2>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="What this card shows"
                  className="flex items-center justify-center size-6 -m-1 rounded-full text-text-light hover:text-text hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 transition-colors duration-200 cursor-pointer"
                >
                  <Info size={14} />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 text-xs text-text-secondary leading-relaxed">
                <p className="font-display font-bold text-text mb-1.5">Team&rsquo;s progress</p>
                <p>How your team&rsquo;s delegations split across To do, In progress and Done for the selected window, plus the overall completion rate. Tap a tile for the exact records behind it.</p>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* Stat tiles — same "tap for the exact records" pattern as the KPI strip above, so a
          reader doesn't have to guess whether this card behaves differently from the rest of the
          dashboard. */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {TILES.map((tile) => (
          <button
            key={tile.key}
            type="button"
            onClick={() => setDrilldown({ title: `${tile.label} delegations`, rows: tile.rows.map(taskRow), href: '/tasks' })}
            className={`flex flex-col items-center justify-center gap-1.5 h-[72px] sm:h-20 rounded-xl border transition-colors duration-200 cursor-pointer hover:brightness-95 dark:hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${tile.tone}`}
          >
            <span className={`flex items-center justify-center size-8 rounded-full text-sm font-display font-bold tabular-nums ${tile.badge}`}>
              {tile.count}
            </span>
            <span className="text-[13px] font-display font-semibold">{tile.label}</span>
          </button>
        ))}
      </div>

      {/* Progressive disclosure — Overdue/Due today are useful but not everyone needs them open
          by default, and keeping this collapsed is most of why the whole card stays short. */}
      <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-surface-hover/30 px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          aria-expanded={detailsOpen}
          className="flex items-center gap-1.5 text-xs font-display font-semibold text-text-secondary hover:text-text transition-colors duration-200 cursor-pointer"
        >
          {detailsOpen ? 'Hide details' : 'Show more details'}
          <ChevronDown size={14} strokeWidth={2.5} className={`transition-transform duration-200 ${detailsOpen ? 'rotate-180' : ''}`} />
        </button>

        {detailsOpen && (
          <div className="flex flex-col gap-2 pt-1.5 border-t border-border/50 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex items-center justify-between gap-3 text-[13px]">
              <span className="text-text-secondary">Average completion rate</span>
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-xs font-bold tabular-nums ${completionRate >= 50 ? 'bg-success/10 border-success/20 text-success' : 'bg-danger/10 border-danger/20 text-danger'}`}>
                {completionRate >= 50 ? <ArrowUpRight size={12} strokeWidth={3} /> : <ArrowDownRight size={12} strokeWidth={3} />}
                {completionRate}%
              </span>
            </div>
            <button
              type="button"
              onClick={() => setDrilldown({ title: 'Overdue delegations', rows: overdue.map(taskRow), href: '/tasks?quickFilter=pending' })}
              className="flex items-center justify-between gap-3 text-[13px] rounded-md -mx-1 px-1 py-1 hover:bg-surface-hover transition-colors duration-200 cursor-pointer text-left"
            >
              <span className="flex items-center gap-1.5 text-text-secondary"><AlertTriangle size={13} className="text-danger" /> Overdue</span>
              <span className="inline-flex items-center bg-danger/10 border border-danger/20 text-danger text-xs font-bold px-1.5 py-0.5 rounded-md tabular-nums">{overdue.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setDrilldown({ title: 'Due today', rows: dueToday.map(taskRow), href: '/tasks?quickFilter=pending' })}
              className="flex items-center justify-between gap-3 text-[13px] rounded-md -mx-1 px-1 py-1 hover:bg-surface-hover transition-colors duration-200 cursor-pointer text-left"
            >
              <span className="flex items-center gap-1.5 text-text-secondary"><Clock size={13} className="text-warning" /> Due today</span>
              <span className="inline-flex items-center bg-warning/10 border border-warning/20 text-warning text-xs font-bold px-1.5 py-0.5 rounded-md tabular-nums">{dueToday.length}</span>
            </button>
          </div>
        )}
      </div>

      {/* Radial chart — the same RadialGauge every other compliance-style chart on this dashboard
          uses, not a second charting library pulled in for one card. */}
      <div className="flex flex-col items-center gap-1 py-1">
        <RadialGauge percent={completionRate} size={128} variant="circle" gradientFrom="var(--color-primary-700, #213e6a)" gradientTo="var(--color-primary-700, #213e6a)">
          <div className="flex flex-col items-center justify-center">
            <span className="text-xl font-display font-black tracking-tighter text-text">{completionRate}%</span>
          </div>
        </RadialGauge>
        <p className="text-[11px] font-medium text-text-light">{done.length} of {total || 0} completed &middot; {PERIOD_LABEL[period].toLowerCase()}</p>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border/50 pt-3.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-sm font-display font-medium text-text-secondary hover:text-text transition-colors duration-200 cursor-pointer"
            >
              {PERIOD_LABEL[period]}
              <ChevronDown size={14} strokeWidth={2.5} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-40">
            {PERIOD_ORDER.map((p) => (
              <DropdownMenuItem key={p} onClick={() => setPeriod(p)}>{PERIOD_LABEL[p]}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          onClick={() => navigate(reportHref)}
          className="inline-flex items-center gap-1.5 text-sm font-display font-semibold text-primary-600 dark:text-primary-400 hover:underline cursor-pointer"
        >
          Progress report
          <ArrowUpRight size={14} strokeWidth={2.5} />
        </button>
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
};
