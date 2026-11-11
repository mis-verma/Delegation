import { memo, useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, ChevronRight, CirclePlus, Clock3, Layers, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatStrip, type StatStripItem } from './StatStrip';
import { CATEGORY_ICON } from './categoryLook';
import { usePrefetchRoute } from '../../lib/routePrefetch';
import { createdRangeHref } from '../../lib/createdRange';
import type { DashboardSummaries } from './useDashboardSummaries';

export type StatScope = 'overall' | 'mine';
type Metric = 'pending' | 'delayed' | 'new' | 'total';
type ModuleKey = 'delegation' | 'tickets' | 'checklist' | 'todo';

interface Counts {
  pending: number;
  overdue: number;
  newToday: number;
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
  loading: boolean;
  failed: boolean;
}

const METRICS: readonly { key: Metric; label: string; caption: string; icon: LucideIcon; tint: StatStripItem['tint'] }[] = [
  { key: 'pending', label: 'Pending', caption: 'Open right now', icon: Clock3, tint: 'primary' },
  { key: 'delayed', label: 'Delayed', caption: 'Past the deadline', icon: AlertTriangle, tint: 'danger' },
  { key: 'new', label: 'New', caption: 'Added today', icon: CirclePlus, tint: 'coral' },
  { key: 'total', label: 'Total', caption: 'All in this view', icon: Layers, tint: 'success' },
];

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const hrefFor = (module: ModuleRow, metric: Metric): string => {
  const { key, base } = module;
  if (key === 'checklist') return metric === 'pending' ? `${base}?status=pending` : metric === 'delayed' ? `${base}?status=overdue` : base;
  if (metric === 'pending') return `${base}?quickFilter=pending`;
  if (metric === 'delayed') return `${base}?quickFilter=delayed`;
  if (metric === 'new') {
    const from = startOfToday();
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    return createdRangeHref(base, from, to);
  }
  return base;
};

const valueOf = (counts: Counts | undefined, metric: Metric) =>
  !counts ? 0 : metric === 'pending' ? counts.pending : metric === 'delayed' ? counts.overdue : metric === 'new' ? counts.newToday : counts.total;

interface HomeStatsProps {
  kpi: DashboardSummaries['kpi'];
  scope: StatScope;
  teamLabel: string;
}

export const HomeStats = memo(({ kpi, scope, teamLabel }: HomeStatsProps) => {
  const [open, setOpen] = useState<Metric | null>(null);
  const panelId = useId();
  const warm = usePrefetchRoute();

  const modules = useMemo<ModuleRow[]>(() => {
    const row = (key: ModuleKey, label: string, icon: LucideIcon, base: string, source: Source): ModuleRow => ({
      key, label, icon, base, counts: source.data, loading: source.isPending && !source.data, failed: !source.data && source.isError,
    });
    const checklistSource = scope === 'mine' ? kpi.checklistToday : kpi.scopeChecklistToday.data ? kpi.scopeChecklistToday : kpi.checklistToday;
    const rows = [
      row('delegation', 'Delegation', CATEGORY_ICON.delegation, '/tasks', kpi.tasks),
      row('tickets', 'Tickets', CATEGORY_ICON.ticket, '/tickets', kpi.tickets),
      row('checklist', 'Checklists, today', CATEGORY_ICON.checklist, '/checklists', checklistSource),
    ];
    if (scope === 'mine') rows.push(row('todo', 'To-do', CATEGORY_ICON.todo, '/todo', kpi.todos));
    return rows;
  }, [kpi, scope]);

  const items = useMemo<StatStripItem[]>(
    () => METRICS.map((m, index) => {
      const loaded = modules.filter((r) => r.counts);
      const total = loaded.reduce((sum, r) => sum + valueOf(r.counts, m.key), 0);
      const loading = loaded.length === 0 && modules.some((r) => r.loading);
      const failed = loaded.length === 0 && !loading;
      const partial = loaded.length < modules.length && loaded.length > 0;
      return {
        key: m.key,
        label: m.label,
        value: total,
        caption: partial ? `${m.caption}, some not loaded` : m.caption,
        icon: m.icon,
        tint: m.key === 'delayed' && total === 0 ? 'success' : m.tint,
        onSelect: () => setOpen((cur) => (cur === m.key ? null : m.key)),
        selected: open === m.key,
        controls: panelId,
        highlight: index === 0,
        loading,
        failed,
      };
    }),
    [modules, open, panelId],
  );

  const active = open ? METRICS.find((m) => m.key === open) : null;

  return (
    <div className="flex flex-col gap-3">
      <StatStrip items={items} label={scope === 'mine' ? 'My own numbers' : `${teamLabel} numbers`} />
      {active && (
        <section id={panelId} aria-label={`${active.label} by area`} className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-surface">
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
                <span className={cn('t-card font-display font-bold tabular-nums', active.key === 'delayed' && value > 0 ? 'text-danger' : 'text-text')}>
                  {m.failed || m.loading ? '-' : value}
                </span>
                <ChevronRight size={16} className="shrink-0 text-text-muted transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            );
          })}
          {scope === 'overall' && (
            <p className="px-4 py-2 t-meta font-medium text-text-muted">To-dos are personal, so they show under My own.</p>
          )}
        </section>
      )}
    </div>
  );
});
HomeStats.displayName = 'HomeStats';
