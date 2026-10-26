import { useCallback, useMemo } from 'react';
import { NO_DEPARTMENT_ROW_ID, NO_STORE_ROW_ID, type ScoreReportRow } from '../../../api/scores';
import { MIN_RANK_VOLUME, overallOf, totalDue } from '../../dashboard/scoreMetrics';
import { explorerRowToReportRow } from '../../scores/explorerAdapters';
import { useTicketOwnerStatsQuery } from './useAnalyticsQueries';
import { useOverviewScores } from './useOverviewScores';

export { MIN_RANK_VOLUME };
export const NEEDS_ATTENTION_BELOW = 70;

export interface RankedRow {
  id: string;
  name: string;
  ticketCompletion: number | null;
  secondaryRate: number | null;
  checklistRate: number | null;
  openIssues: number;
  avgTat: number | null;
  slaMet: number | null;
  overall: number | null;
  volume: number;
}

const toRankedRow = (row: ScoreReportRow, secondary: 'delegation' | 'checklist', avgTat: number | null): RankedRow => ({
  id: row.id,
  name: row.name,
  ticketCompletion: row.ticket.completionPct,
  secondaryRate: row[secondary].completionPct,
  checklistRate: row.checklist.completionPct,
  openIssues: Math.max(0, row.ticket.due - row.ticket.closed),
  avgTat,
  slaMet: row.ticket.onTimePct,
  overall: overallOf(row),
  volume: totalDue(row),
});

export interface RankedTable {
  sorted: RankedRow[];
  topId: string | null;
  lowId: string | null;
}

export const rankRows = (rows: RankedRow[]): RankedTable => {
  const tier = (r: RankedRow) => (r.overall == null ? 2 : r.volume >= MIN_RANK_VOLUME ? 0 : 1);
  const sorted = [...rows].sort((a, b) => {
    if (tier(a) !== tier(b)) return tier(a) - tier(b);
    if (a.overall == null || b.overall == null) return a.name.localeCompare(b.name);
    return b.overall - a.overall || b.volume - a.volume || a.name.localeCompare(b.name);
  });
  const eligible = sorted.filter((r) => r.overall != null && r.volume >= MIN_RANK_VOLUME);
  const top = eligible.length >= 2 ? eligible[0] : null;
  const worst = eligible[eligible.length - 1];
  const low = worst && worst.id !== top?.id && (worst.overall ?? 100) < NEEDS_ATTENTION_BELOW ? worst : null;
  return { sorted, topId: top?.id ?? null, lowId: low?.id ?? null };
};

export const useOwnerRankings = (from?: string, to?: string) => {
  const departmentQuery = useOverviewScores(from, to, { view: 'department' });
  const storeQuery = useOverviewScores(from, to, { view: 'store' });
  const deptTatQuery = useTicketOwnerStatsQuery('department', from, to);
  const storeTatQuery = useTicketOwnerStatsQuery('store', from, to);

  const deptTat = useMemo(() => new Map((deptTatQuery.data ?? []).map((r) => [r.ownerId, r.avgTatHours])), [deptTatQuery.data]);
  const storeTat = useMemo(() => new Map((storeTatQuery.data ?? []).map((r) => [r.ownerId, r.avgTatHours])), [storeTatQuery.data]);

  const departmentRows: RankedRow[] = useMemo(
    () => (departmentQuery.data?.rows ?? []).filter((r) => r.id !== NO_DEPARTMENT_ROW_ID).map((r) => toRankedRow(explorerRowToReportRow(r), 'delegation', deptTat.get(r.id) ?? null)),
    [departmentQuery.data, deptTat],
  );
  const departmentUntagged: RankedRow[] = useMemo(
    () => (departmentQuery.data?.rows ?? []).filter((r) => r.id === NO_DEPARTMENT_ROW_ID).map((r) => toRankedRow(explorerRowToReportRow(r), 'delegation', null)),
    [departmentQuery.data],
  );
  const storeUntagged: RankedRow[] = useMemo(
    () => (storeQuery.data?.rows ?? []).filter((r) => r.id === NO_STORE_ROW_ID).map((r) => toRankedRow(explorerRowToReportRow(r), 'checklist', null)),
    [storeQuery.data],
  );
  const storeRows: RankedRow[] = useMemo(
    () => (storeQuery.data?.rows ?? []).filter((r) => r.id !== NO_STORE_ROW_ID).map((r) => toRankedRow(explorerRowToReportRow(r), 'checklist', storeTat.get(r.id) ?? null)),
    [storeQuery.data, storeTat],
  );

  const retryDepartments = useCallback(() => { if (departmentQuery.isError) void departmentQuery.refetch(); }, [departmentQuery]);
  const retryStores = useCallback(() => { if (storeQuery.isError) void storeQuery.refetch(); }, [storeQuery]);

  return {
    departmentRows,
    storeRows,
    departmentUntagged,
    storeUntagged,
    total: departmentQuery.total,
    window: departmentQuery.win,
    updating: departmentQuery.updating || storeQuery.updating,
    departmentsPending: departmentQuery.isPending,
    storesPending: storeQuery.isPending,
    departmentsError: departmentQuery.isError && !departmentQuery.data,
    storesError: storeQuery.isError && !storeQuery.data,
    retryDepartments,
    retryStores,
  };
};
