import { memo, useId, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router';
import { AlertTriangle, CalendarClock, ChevronRight, Clock3, Layers, ShieldCheck, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatBoard, type BoardTile, type BoardTone } from './StatBoard';
import type { ApprovalFigure } from './approvalFigures';
import { CATEGORY_ICON } from './categoryLook';
import { usePrefetchRoute } from '../../lib/routePrefetch';
import { useAuth } from '../../context/AuthContext';
import type { DashboardSummaries } from './useDashboardSummaries';

export type StatScope = 'overall' | 'mine';
type Metric = 'total' | 'pending' | 'delayed' | 'due';
type ModuleKey = 'delegation' | 'tickets' | 'checklist' | 'todo';

interface Counts {
  pending: number;
  overdue: number;
  due: number;
  total: number;
}

interface Source {
  data: Counts | undefined;
  isPending: boolean;
  isError: boolean;
}

interface ModuleRow {
  key: ModuleKey;
  label: string;
  icon: LucideIcon;
  base: string;
  counts: Counts | undefined;
  team?: boolean;
  loading: boolean;
  failed: boolean;
}

const METRICS: readonly { key: Metric; label: string; caption: string; icon: LucideIcon; tint: BoardTone }[] = [
  { key: 'total', label: 'Total', caption: 'Everything in this view', icon: Layers, tint: 'primary' },
  { key: 'pending', label: 'Pending', caption: 'Still open', icon: Clock3, tint: 'coral' },
  { key: 'delayed', label: 'Delayed', caption: 'Past the deadline', icon: AlertTriangle, tint: 'danger' },
  { key: 'due', label: 'Due', caption: 'Open and still on time', icon: CalendarClock, tint: 'success' },
];

const hrefFor = (module: ModuleRow, metric: Metric): string => {
  const { key, base } = module;
  if (key === 'checklist') return checklistHref(metric, module.team === true);
  if (key === 'todo') return base;
  if (metric === 'pending') return `${base}?quickFilter=pending`;
  if (metric === 'delayed') return `${base}?quickFilter=delayed`;
  if (metric === 'due') return `${base}?quickFilter=due`;
  return base;
};

const valueOf = (counts: Counts | undefined, metric: Metric) =>
  !counts ? 0 : metric === 'pending' ? counts.pending : metric === 'delayed' ? counts.overdue : metric === 'due' ? counts.due : counts.total;

const checklistHref = (metric: Metric, team: boolean): string => {
  const base = team ? '/checklists/team' : '/checklists';
  return metric === 'pending' || metric === 'due' ? `${base}?status=pending` : metric === 'delayed' ? `${base}?status=overdue` : team ? `${base}?status=all` : base;
};

interface HomeStatsProps {
  kpi: DashboardSummaries['kpi'];
  scope: StatScope;
  teamLabel: string;
  approval?: ApprovalFigure;
}

export const HomeStats = memo(({ kpi, scope, teamLabel, approval }: HomeStatsProps) => {
  const [open, setOpen] = useState<Metric | null>(null);
  const panelId = useId();
  const warm = usePrefetchRoute();
  const reduce = useReducedMotion();
  const { user } = useAuth();
  const canSeeTeam = user?.role === 'ADMIN' || user?.role === 'PC' || user?.role === 'MANAGER' || user?.role === 'SENIOR';

  const modules = useMemo<ModuleRow[]>(() => {
    const row = (key: ModuleKey, label: string, icon: LucideIcon, base: string, source: Source, team = false): ModuleRow => ({
      key, label, icon, base, team, counts: source.data, loading: source.isPending && !source.data, failed: !source.data && source.isError,
    });
    const checklistSource = scope === 'mine' ? kpi.checklistToday : kpi.scopeChecklistToday.data ? kpi.scopeChecklistToday : kpi.checklistToday;
    const rows = [
      row('delegation', 'Delegation', CATEGORY_ICON.delegation, '/tasks', kpi.tasks),
      row('tickets', 'Tickets', CATEGORY_ICON.ticket, '/tickets', kpi.tickets),
      row('checklist', 'Checklists, today', CATEGORY_ICON.checklist, canSeeTeam && scope === 'overall' ? '/checklists/team' : '/checklists', checklistSource, canSeeTeam && scope === 'overall'),
    ];
    if (scope === 'mine') rows.push(row('todo', 'To-do', CATEGORY_ICON.todo, '/todo', kpi.todos));
    return rows;
  }, [kpi, scope, canSeeTeam]);

  const items = useMemo<BoardTile[]>(
    () => METRICS.map((m) => {
      const loaded = modules.filter((r) => r.counts);
      const total = loaded.reduce((sum, r) => sum + valueOf(r.counts, m.key), 0);
      const loading = loaded.length === 0 && modules.some((r) => r.loading);
      const failed = loaded.length === 0 && !loading;
      const partial = loaded.length < modules.length && loaded.length > 0;
      return {
        key: m.key,
        label: m.label,
        value: total,
        breakdown: modules.map((r) => ({ key: r.key, label: r.label, value: valueOf(r.counts, m.key), missing: !r.counts })),
        caption: partial ? `${m.caption}, some not loaded` : m.caption,
        icon: m.icon,
        tone: m.key === 'delayed' && total === 0 ? 'success' : m.tint,
        onSelect: () => setOpen((cur) => (cur === m.key ? null : m.key)),
        selected: open === m.key,
        controls: panelId,
        loading,
        failed,
      };
    }),
    [modules, open, panelId],
  );

  const active = open ? METRICS.find((m) => m.key === open) : null;

  return (
    <div className="flex flex-col gap-3">
      <StatBoard
        label={scope === 'mine' ? 'My own numbers' : `${teamLabel} numbers`}
        open={items[1]?.value ?? 0}
        total={items[0]}
        tiles={approval ? [...items.slice(1), {
          key: 'approval',
          label: 'Approval',
          value: approval.value,
          caption: approval.caption,
          icon: ShieldCheck,
          tone: approval.delayed > 0 ? 'danger' : 'primary',
          href: approval.href,
          loading: approval.loading,
          failed: approval.failed,
        }] : items.slice(1)}
      />
      <AnimatePresence initial={false}>
      {active && (
        <motion.section
          key={active.key}
          id={panelId}
          aria-label={`${active.label} by area`}
          initial={reduce ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col divide-y divide-border/50 overflow-hidden rounded-2xl bg-surface ring-1 ring-inset ring-border/60"
        >
          <h3 className="px-4 py-2.5 t-meta font-display font-bold text-text">{active.label} by area</h3>
          {modules.map((m) => {
            const Icon = m.icon;
            const value = valueOf(m.counts, active.key);
            const href = hrefFor(m, active.key);
            return (
              <Link
                key={m.key}
                to={href}
                viewTransition
                onPointerEnter={() => warm(m.base)}
                onTouchStart={() => warm(m.base)}
                aria-label={`${m.label}: ${m.failed ? 'could not load' : value}. Open`}
                className="group flex min-h-12 items-center gap-3 px-4 py-2 outline-none transition-colors duration-150 hover:bg-surface-hover/50 focus-visible:bg-surface-hover active:bg-surface-hover"
              >
                <Icon size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate t-card font-display font-semibold text-text">{m.label}</span>
                <span className={cn('t-card font-figure font-extrabold tabular-nums', active.key === 'delayed' && value > 0 ? 'text-danger' : 'text-text')}>
                  {m.failed || m.loading ? '-' : value}
                </span>
                <ChevronRight size={16} className="shrink-0 text-text-muted transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            );
          })}
          {scope === 'overall' && (
            <p className="px-4 py-2 t-meta font-medium text-text-muted">To-dos are personal, so they show under My own.</p>
          )}
        </motion.section>
      )}
      </AnimatePresence>
    </div>
  );
});
HomeStats.displayName = 'HomeStats';
