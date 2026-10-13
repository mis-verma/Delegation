import { useCallback, useMemo } from 'react';
import { NO_DEPARTMENT_ROW_ID, type ScoreReportRow } from '../../../api/scores';
import { MIN_RANK_VOLUME, overallOf, totalDue } from '../../dashboard/scoreMetrics';
import { explorerRowToReportRow } from '../../scores/explorerAdapters';
import { useTicketOwnerStatsQuery } from './useAnalyticsQueries';
import { useOverviewScores } from './useOverviewScores';

/** A row needs at least this many items due (checklists, tickets and delegations together) before it can
 *  be called "Top" or "Needs attention". One bad ticket in a quiet store is not a trend. */
export { MIN_RANK_VOLUME };
/** "Needs attention" only appears for a row whose overall figure is below this. A low-ranked row
 *  that is still doing fine is just lower down the list. */
export const NEEDS_ATTENTION_BELOW = 70;

/** One department or store in the ranking tables. Every rate is the raw 0 to 100 figure: round it
 *  once with formatPercent when it is shown, never in here. */
export interface RankedRow {
  id: string;
  name: string;
  /** Tickets closed out of tickets due in the window. */
  ticketCompletion: number | null;
  /** Delegation completion for the Departments cut, store checklist completion for the Stores cut. */
  secondaryRate: number | null;
  /** Checklist completion over the runs that were due. */
  checklistRate: number | null;
  /** Tickets due in the window that are not closed. */
  openIssues: number;
  /** Average hours from raised to closed, for tickets closed in the window. */
  avgTat: number | null;
  /** Closed on time: of the tickets closed, the share closed by their due time. */
  slaMet: number | null;
  /** The Overall score, the one rule every score view uses (overallOf): completion and compliance of every
   *  module with something due, counted equally. Null when nothing was due. */
  overall: number | null;
  /** Everything due in the window across checklists, tickets and delegations: what the minimum-volume rule checks. */
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
  /** Best overall first; rows with no figure last. */
  sorted: RankedRow[];
  topId: string | null;
  lowId: string | null;
}

/** Orders rows and decides who earns a badge. Pure, so callers memoise it on their rows. */
export const rankRows = (rows: RankedRow[]): RankedTable => {
  // Ranked rows first (enough items behind the figure), then rows with too few items to rank, then
  // rows with no figure. A store with 100% over one ticket must not sit above a store with 95% over 200.
  const tier = (r: RankedRow) => (r.overall == null ? 2 : r.volume >= MIN_RANK_VOLUME ? 0 : 1);
  const sorted = [...rows].sort((a, b) => {
    if (tier(a) !== tier(b)) return tier(a) - tier(b);
    if (a.overall == null || b.overall == null) return a.name.localeCompare(b.name);
    return b.overall - a.overall || b.volume - a.volume || a.name.localeCompare(b.name);
  });
  const eligible = sorted.filter((r) => r.overall != null && r.volume >= MIN_RANK_VOLUME);
  // A lone eligible row has nothing to be "top" of, but can still need attention.
  const top = eligible.length >= 2 ? eligible[0] : null;
  const worst = eligible[eligible.length - 1];
  const low = worst && worst.id !== top?.id && (worst.overall ?? 100) < NEEDS_ATTENTION_BELOW ? worst : null;
  return { sorted, topId: top?.id ?? null, lowId: low?.id ?? null };
};

/** The owner-level "who is top, who is low" ranking, by department and by store. The Overall score and the
 *  counts come from the score explorer (the same answer, the same rule and the same cache entries as the Scores
 *  page, the leaderboard and the card ranking). Only the average time to close still comes from the ticket owner
 *  stats, because the explorer does not carry it. Shared by the glance card on the Overview and the full
 *  Stores table, so both always show the same numbers. `from` and `to` are the Overview window (ISO instants). */
export const useOwnerRankings = (from?: string, to?: string) => {
  const departmentQuery = useOverviewScores(from, to, { view: 'department' });
  const storeQuery = useOverviewScores(from, to, { view: 'store' });
  // Only the average time to close: if these fail the rankings still show, just without that column.
  const deptTatQuery = useTicketOwnerStatsQuery('department', from, to);
  const storeTatQuery = useTicketOwnerStatsQuery('store', from, to);

  const deptTat = useMemo(() => new Map((deptTatQuery.data ?? []).map((r) => [r.ownerId, r.avgTatHours])), [deptTatQuery.data]);
  const storeTat = useMemo(() => new Map((storeTatQuery.data ?? []).map((r) => [r.ownerId, r.avgTatHours])), [storeTatQuery.data]);

  const departmentRows: RankedRow[] = useMemo(
    // The "No department" row is not a team, so it is never named Top or Needs attention (it stays on the Scores page).
    () => (departmentQuery.data?.rows ?? []).filter((r) => r.id !== NO_DEPARTMENT_ROW_ID).map((r) => toRankedRow(explorerRowToReportRow(r), 'delegation', deptTat.get(r.id) ?? null)),
    [departmentQuery.data, deptTat],
  );
  const storeRows: RankedRow[] = useMemo(
    () => (storeQuery.data?.rows ?? []).map((r) => toRankedRow(explorerRowToReportRow(r), 'checklist', storeTat.get(r.id) ?? null)),
    [storeQuery.data, storeTat],
  );

  const retryDepartments = useCallback(() => { if (departmentQuery.isError) void departmentQuery.refetch(); }, [departmentQuery]);
  const retryStores = useCallback(() => { if (storeQuery.isError) void storeQuery.refetch(); }, [storeQuery]);

  return {
    departmentRows,
    storeRows,
    /** The whole-window row (everything counted once): the page-level figures above the tables. */
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
