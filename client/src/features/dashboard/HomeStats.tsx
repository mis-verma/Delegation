import { memo, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, Clock3, Layers, ShieldCheck, type LucideIcon } from 'lucide-react';
import { StatBoard, type BoardTile, type BoardTone } from './StatBoard';
import type { ApprovalFigure } from './approvalFigures';
import { CATEGORY_ICON } from './categoryLook';
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
  const [activeKey, setActiveKey] = useState<Metric>('total');
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
        breakdown: modules.map((r) => ({ key: r.key, label: r.label, icon: r.icon, href: hrefFor(r, m.key), value: valueOf(r.counts, m.key), missing: !r.counts })),
        caption: partial ? `${m.caption}, some not loaded` : m.caption,
        icon: m.icon,
        tone: m.key === 'delayed' && total === 0 ? 'success' : m.tint,
        onSelect: () => setActiveKey(m.key),
        selected: activeKey === m.key,
        loading,
        failed,
      };
    }),
    [modules, activeKey],
  );

  const active = items.find((i) => i.key === activeKey) ?? items[0];
  const tiles: BoardTile[] = approval
    ? [...items, {
        key: 'approval',
        label: 'Approval',
        value: approval.value,
        caption: approval.caption,
        icon: ShieldCheck,
        tone: approval.delayed > 0 ? 'danger' : 'primary',
        href: approval.href,
        loading: approval.loading,
        failed: approval.failed,
      }]
    : items;

  return (
    <StatBoard
      label={scope === 'mine' ? 'My own numbers' : `${teamLabel} numbers`}
      active={active}
      tiles={tiles}
      note={scope === 'overall' ? 'To-dos are personal, so they show under My own.' : undefined}
    />
  );
});
HomeStats.displayName = 'HomeStats';
