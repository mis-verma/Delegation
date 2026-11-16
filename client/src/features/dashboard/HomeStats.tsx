import { memo, useMemo } from 'react';
import { Layers, Siren } from 'lucide-react';
import { StatBoard, type BoardApprovalPart, type BoardColumn, type BoardRow, type BoardSummary } from './StatBoard';
import { buildModuleRoute, buildWorkRoute, type StatScopeKey, type StatTargetContext } from './work/statTargets';
import {
  APPROVALS_LABEL, APPROVAL_PARAMS, APPROVAL_STATUS_FIELD, COUNT_FIELD, MODULE_STATS_SCHEMA, SCOPE_MODULES, STATS_VIEW_SCHEMA, STATUS_LABEL, STATUS_TONE, SUMMARY_MODULES,
  type ApprovalParam, type ModuleKey, type StatsView, type StatusKey,
} from './work/statsRegistry';
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

const approvalValue = (approval: ApprovalFigure, status: StatusKey): number => {
  const field = APPROVAL_STATUS_FIELD[status];
  const kinds = field ? sumOf(APPROVAL_PARAMS.map((p) => approval.kinds?.[p.key][field] ?? 0)) : 0;
  return status === 'pending' || status === 'total' ? approval.value : status === 'delayed' ? approval.delayed : kinds;
};

interface HomeStatsProps {
  kpi: DashboardSummaries['kpi'];
  scope: StatScope;
  teamLabel: string;
  view?: StatsView;
  approval?: ApprovalFigure;
}

export const HomeStats = memo(({ kpi, scope, teamLabel, view = 'work', approval }: HomeStatsProps) => {
  const { user } = useAuth();
  const userId = user?.id;
  const canSeeTeam = user?.role === 'ADMIN' || user?.role === 'PC' || user?.role === 'MANAGER' || user?.role === 'SENIOR';
  const overall = scope === 'overall';
  const workScope: StatScopeKey = overall ? 'visible' : 'mine';
  const viewSchema = STATS_VIEW_SCHEMA[view];

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
      const statuses = viewSchema.statuses?.[key] ?? schema.statuses;
      const totalStatus = viewSchema.totalStatus[key] ?? viewSchema.totalStatus.default;
      const route = (status: StatusKey, sub?: ApprovalParam) =>
        buildModuleRoute(key, status, sub, key === 'approvals' ? { ...ctx, routeOverride: approval?.href } : ctx);
      const isApprovals = key === 'approvals' && !!approval;
      const loading = isApprovals ? approval.loading : state.loading;
      const failed = isApprovals ? approval.failed : state.failed;
      const valueOf = (status: StatusKey) => (isApprovals ? approvalValue(approval, status) : state.counts[status]);
      const rows: BoardRow[] = statuses.map((status) => ({
        key: status,
        label: schema.statusLabels?.[status] ?? STATUS_LABEL[status],
        value: valueOf(status),
        href: route(status),
        tone: STATUS_TONE[status],
        loading,
        missing: failed,
      }));
      const pills: BoardApprovalPart[] | undefined = isApprovals
        ? APPROVAL_PARAMS.map((p) => ({ key: p.key, label: p.label, value: approval.kinds?.[p.key].pending ?? 0, href: route('pending', p.key) }))
        : undefined;
      return {
        key,
        label: schema.label,
        icon: schema.icon,
        tone: schema.tone,
        total: valueOf(totalStatus),
        totalLabel: viewSchema.totalLabels?.[key] ?? schema.totalLabel,
        href: route(totalStatus),
        rows,
        pills,
        loading,
        failed,
      };
    });
  }, [scope, metricsByModule, approval, ctx, viewSchema]);

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
    const status = viewSchema.summaryStatus;
    const actionable = view === 'attention' && approval ? approval.value : 0;
    return {
      label: viewSchema.summaryLabel,
      caption: loaded.length < modules.length && loaded.length > 0 ? `${viewSchema.summaryCaption}, some not loaded` : viewSchema.summaryCaption,
      icon: view === 'attention' ? Siren : Layers,
      total: sumOf(loaded.map((k) => metricsByModule[k].counts[status])) + actionable,
      href: buildWorkRoute(status, workScope),
      parts: modules.map((k) => ({
        key: k,
        label: k === 'checklist' ? 'Checklists, today' : MODULE_STATS_SCHEMA[k].label,
        icon: MODULE_STATS_SCHEMA[k].icon,
        value: metricsByModule[k].counts[status],
        href: buildModuleRoute(k, status, undefined, ctx),
        missing: metricsByModule[k].failed,
        loading: metricsByModule[k].loading,
      })),
      approvals,
      loading,
      failed,
    };
  }, [metricsByModule, approval, ctx, workScope, viewSchema, view]);

  return (
    <StatBoard
      label={scope === 'mine' ? 'My own numbers' : `${teamLabel} numbers`}
      summary={summary}
      columns={columns}
      note={overall && view === 'work' ? 'To-dos are personal, so they show under My own.' : undefined}
    />
  );
});
HomeStats.displayName = 'HomeStats';
