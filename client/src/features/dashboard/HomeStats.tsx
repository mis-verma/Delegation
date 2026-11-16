import { memo, useMemo } from 'react';
import { Layers } from 'lucide-react';
import { StatBoard, type BoardApprovalPart, type BoardColumn, type BoardRow, type BoardSummary } from './StatBoard';
import { buildModuleRoute, buildWorkRoute, type StatScopeKey, type StatTargetContext } from './work/statTargets';
import {
  APPROVALS_LABEL, APPROVAL_PARAMS, APPROVAL_STATUS_FIELD, COUNT_FIELD, MODULE_STATS_SCHEMA, SCOPE_MODULES, STATUS_LABEL, STATUS_TONE, SUMMARY_MODULES,
  type ApprovalParam, type ModuleKey, type StatusKey,
} from './work/statsConfig';
import type { ApprovalFigure } from './approvalFigures';
import { useAuth } from '../../context/AuthContext';
import type { DashboardSummaries } from './useDashboardSummaries';

export type StatScope = 'overall' | 'mine';

type Counts = Partial<Record<(typeof COUNT_FIELD)[StatusKey], number>>;

interface Source {
  data: Counts | undefined;
  isPending: boolean;
  isError: boolean;
}

interface ModuleState {
  counts: Record<StatusKey, number>;
  loading: boolean;
  failed: boolean;
  present: boolean;
}

const STATUS_KEYS = Object.keys(STATUS_LABEL) as StatusKey[];

const EMPTY_COUNTS = Object.fromEntries(STATUS_KEYS.map((s) => [s, 0])) as Record<StatusKey, number>;

const normalise = (source: Source | undefined): ModuleState => {
  const data = source?.data;
  return {
    present: !!source,
    loading: !!source && source.isPending && !data,
    failed: !!source && !data && source.isError,
    counts: data ? (Object.fromEntries(STATUS_KEYS.map((s) => [s, data[COUNT_FIELD[s]] ?? 0])) as Record<StatusKey, number>) : EMPTY_COUNTS,
  };
};

const sumOf = (values: number[]) => values.reduce((n, v) => n + v, 0);

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
  const overall = scope === 'overall';
  const workScope: StatScopeKey = overall ? 'visible' : 'mine';

  const metricsByModule = useMemo<Record<ModuleKey, ModuleState>>(() => {
    const checklist = !overall || !canSeeTeam ? kpi.checklistToday : kpi.scopeChecklistToday;
    return {
      delegation: normalise(kpi.tasks),
      tickets: normalise(kpi.tickets),
      checklist: normalise(checklist),
      todo: normalise(overall ? undefined : kpi.todos),
      approvals: normalise(undefined),
    };
  }, [kpi, overall, canSeeTeam]);

  const ctx = useMemo<StatTargetContext>(
    () => ({ scope: workScope, team: overall, userId }),
    [workScope, overall, userId],
  );

  const columns = useMemo<BoardColumn[]>(() => {
    const keys = SCOPE_MODULES[scope].filter((k) => k !== 'approvals' || !!approval);
    return keys.map((key): BoardColumn => {
      const schema = MODULE_STATS_SCHEMA[key];
      const state = metricsByModule[key];
      const route = (status: StatusKey, sub?: ApprovalParam) =>
        buildModuleRoute(key, status, sub, key === 'approvals' ? { ...ctx, routeOverride: approval?.href } : ctx);

      if (key === 'approvals' && approval) {
        const fieldTotal = (status: StatusKey) => {
          const field = APPROVAL_STATUS_FIELD[status];
          return field ? sumOf(APPROVAL_PARAMS.map((p) => approval.kinds?.[p.key][field] ?? 0)) : 0;
        };
        const rows: BoardRow[] = schema.statuses.map((status) => ({
          key: status,
          label: schema.statusLabels?.[status] ?? STATUS_LABEL[status],
          value: status === 'pending' ? approval.value : status === 'delayed' ? approval.delayed : fieldTotal(status),
          href: route(status),
          tone: STATUS_TONE[status],
          loading: approval.loading,
          missing: approval.failed,
        }));
        const pills: BoardApprovalPart[] = APPROVAL_PARAMS.map((p) => ({ key: p.key, label: p.label, value: approval.kinds?.[p.key].pending ?? 0, href: route('pending', p.key) }));
        return { key, label: schema.label, icon: schema.icon, tone: schema.tone, total: approval.value, totalLabel: schema.totalLabel, href: route('total'), rows, pills, loading: approval.loading, failed: approval.failed };
      }

      const rows: BoardRow[] = schema.statuses.map((status) => ({
        key: status,
        label: schema.statusLabels?.[status] ?? STATUS_LABEL[status],
        value: state.counts[status],
        href: route(status),
        tone: STATUS_TONE[status],
        loading: state.loading,
        missing: state.failed,
      }));
      return { key, label: schema.label, icon: schema.icon, tone: schema.tone, total: state.counts.total, totalLabel: schema.totalLabel, href: route('total'), rows, loading: state.loading, failed: state.failed };
    });
  }, [scope, metricsByModule, approval, ctx]);

  const summary = useMemo<BoardSummary>(() => {
    const modules = SUMMARY_MODULES.filter((k) => metricsByModule[k].present);
    const loaded = modules.filter((k) => !metricsByModule[k].loading && !metricsByModule[k].failed);
    const loading = loaded.length === 0 && modules.some((k) => metricsByModule[k].loading);
    const failed = loaded.length === 0 && !loading;
    const approvalCtx: StatTargetContext = { ...ctx, routeOverride: approval?.href };
    const approvals = approval
      ? {
          label: APPROVALS_LABEL,
          value: approval.value,
          href: buildModuleRoute('approvals', 'pending', undefined, approvalCtx),
          loading: approval.loading,
          failed: approval.failed,
          parts: APPROVAL_PARAMS.map((p) => ({ key: p.key, label: p.label, value: approval.kinds?.[p.key].pending ?? 0, href: buildModuleRoute('approvals', 'pending', p.key, approvalCtx) })),
        }
      : undefined;
    return {
      label: 'Total',
      caption: loaded.length < modules.length && loaded.length > 0 ? 'Everything in this view, some not loaded' : 'Everything in this view',
      icon: Layers,
      total: sumOf(loaded.map((k) => metricsByModule[k].counts.total)),
      href: buildWorkRoute('total', workScope),
      parts: modules.map((k) => ({
        key: k,
        label: k === 'checklist' ? 'Checklists, today' : MODULE_STATS_SCHEMA[k].label,
        icon: MODULE_STATS_SCHEMA[k].icon,
        value: metricsByModule[k].counts.total,
        href: buildModuleRoute(k, 'total', undefined, ctx),
        missing: metricsByModule[k].failed,
        loading: metricsByModule[k].loading,
      })),
      approvals,
      loading,
      failed,
    };
  }, [metricsByModule, approval, ctx, workScope]);

  return (
    <StatBoard
      label={scope === 'mine' ? 'My own numbers' : `${teamLabel} numbers`}
      summary={summary}
      columns={columns}
      note={overall ? 'To-dos are personal, so they show under My own.' : undefined}
    />
  );
});
HomeStats.displayName = 'HomeStats';
