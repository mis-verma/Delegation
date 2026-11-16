import { memo, useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { StatBoard, type BoardApprovals, type BoardTile } from './StatBoard';
import { WORK_METRIC_LOOK, metricValue, type WorkScope } from './work/workMetrics';
import { getStatTargetUrl, type StatTargetContext } from './work/statTargets';
import type { WorkKind, WorkMetric } from '../../api/dashboard';
import type { ApprovalFigure } from './approvalFigures';
import { APPROVALS_LABEL, APPROVAL_FIELD, APPROVAL_PARAMS } from './work/statsConfig';
import { CATEGORY_ICON } from './categoryLook';
import { useAuth } from '../../context/AuthContext';
import type { DashboardSummaries } from './useDashboardSummaries';

export type StatScope = 'overall' | 'mine';
type Metric = WorkMetric;
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
  counts: Counts | undefined;
  team?: boolean;
  loading: boolean;
  failed: boolean;
}

const METRICS = WORK_METRIC_LOOK;

const KIND_OF: Record<ModuleKey, WorkKind> = { delegation: 'delegation', tickets: 'ticket', checklist: 'checklist', todo: 'todo' };

const hrefFor = (module: ModuleRow, metric: Metric, ctx: StatTargetContext): string => getStatTargetUrl(KIND_OF[module.key], metric, undefined, { ...ctx, team: module.team === true });

const approvalsFor = (approval: ApprovalFigure | undefined, metric: Metric, ctx: StatTargetContext): BoardApprovals | undefined => {
  if (!approval) return undefined;
  const field = APPROVAL_FIELD[metric];
  const parts = APPROVAL_PARAMS.map((k) => ({ key: k.key, label: k.label, value: approval.kinds?.[k.key][field] ?? 0, href: getStatTargetUrl('approvals', metric, k.key, ctx) }));
  const value = field === 'pending' ? approval.value : field === 'old' ? approval.delayed : parts.reduce((n, p) => n + p.value, 0);
  return { label: APPROVALS_LABEL, value, parts, href: getStatTargetUrl('approvals', metric, undefined, ctx), loading: approval.loading, failed: approval.failed };
};

const valueOf = (counts: Counts | undefined, metric: Metric) => metricValue(counts, metric);

interface HomeStatsProps {
  kpi: DashboardSummaries['kpi'];
  scope: StatScope;
  teamLabel: string;
  approval?: ApprovalFigure;
}

export const HomeStats = memo(({ kpi, scope, teamLabel, approval }: HomeStatsProps) => {
  const { user } = useAuth();
  const userId = user?.id;
  const canSeeTeam = user?.role === 'ADMIN' || user?.role === 'PC' || user?.role === 'MANAGER' || user?.role === 'SENIOR';

  const modules = useMemo<ModuleRow[]>(() => {
    const row = (key: ModuleKey, label: string, icon: LucideIcon, source: Source, team = false): ModuleRow => ({
      key, label, icon, team, counts: source.data, loading: source.isPending && !source.data, failed: !source.data && source.isError,
    });
    const checklistSource = scope === 'mine' || !canSeeTeam ? kpi.checklistToday : kpi.scopeChecklistToday;
    const rows = [
      row('delegation', 'Delegation', CATEGORY_ICON.delegation, kpi.tasks),
      row('tickets', 'Tickets', CATEGORY_ICON.ticket, kpi.tickets),
      row('checklist', 'Checklists, today', CATEGORY_ICON.checklist, checklistSource, canSeeTeam && scope === 'overall'),
    ];
    if (scope === 'mine') rows.push(row('todo', 'To-do', CATEGORY_ICON.todo, kpi.todos));
    return rows;
  }, [kpi, scope, canSeeTeam]);

  const workScope: WorkScope = scope === 'mine' ? 'mine' : 'visible';
  const items = useMemo<BoardTile[]>(
    () => METRICS.map((m) => {
      const ctx: StatTargetContext = { scope: workScope, userId, approvalsBase: approval?.href };
      const loaded = modules.filter((r) => r.counts);
      const total = loaded.reduce((sum, r) => sum + valueOf(r.counts, m.key), 0);
      const loading = loaded.length === 0 && modules.some((r) => r.loading);
      const failed = loaded.length === 0 && !loading;
      const partial = loaded.length < modules.length && loaded.length > 0;
      return {
        key: m.key,
        label: m.label,
        value: total,
        approvals: approvalsFor(approval, m.key, ctx),
        breakdown: modules.map((r) => ({ key: r.key, label: r.label, icon: r.icon, href: hrefFor(r, m.key, ctx), value: valueOf(r.counts, m.key), missing: !r.counts && !r.loading, loading: r.loading && !r.counts })),
        caption: partial ? `${m.caption}, some not loaded` : m.caption,
        icon: m.icon,
        tone: m.key === 'delayed' && total === 0 ? 'success' : m.tint,
        href: getStatTargetUrl('work', m.key, undefined, ctx),
        loading,
        failed,
        hideOnPhone: m.key === 'total',
      };
    }),
    [modules, workScope, userId, approval],
  );

  const active = items[0];
  return (
    <StatBoard
      label={scope === 'mine' ? 'My own numbers' : `${teamLabel} numbers`}
      active={active}
      tiles={items}
      note={scope === 'overall' ? 'To-dos are personal, so they show under My own.' : undefined}
    />
  );
});
HomeStats.displayName = 'HomeStats';
