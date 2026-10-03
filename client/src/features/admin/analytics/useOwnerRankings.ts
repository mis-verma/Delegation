import { useCallback, useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { useDepartmentsQuery, useStoresQuery } from '../../tickets/hook';
import { checklistInstanceApi, type ChecklistStoreComplianceRow } from '../../../api/checklistInstances';
import { handleQueryRetry } from '../../../lib/queryHelpers';
import { useTicketOwnerStatsQuery, useTaskOwnerStatsQuery } from './useAnalyticsQueries';
import type { OwnerStatsRow } from '../../../api/ticket';
import type { TaskOwnerStatsRow } from '../../../api/task';

/** A row needs at least this many tickets plus checklist items or delegations before it can be
 *  called "Top" or "Needs attention". One bad ticket in a quiet store is not a trend. */
export const MIN_RANK_VOLUME = 5;
/** "Needs attention" only appears for a row whose overall figure is below this. A low-ranked row
 *  that is still doing fine is just lower down the list. */
export const NEEDS_ATTENTION_BELOW = 70;

/** One department or store in the ranking tables. Every rate is the raw 0 to 100 figure: round it
 *  once with formatPercent when it is shown, never in here. */
export interface RankedRow {
  id: string;
  name: string;
  /** Tickets closed out of tickets raised in the window. */
  ticketCompletion: number | null;
  /** Delegation completion for the Departments cut, store checklist completion for the Stores cut. */
  secondaryRate: number | null;
  openIssues: number;
  /** Average hours from raised to closed, for tickets closed in the window. */
  avgTat: number | null;
  /** Closed on time: closed tickets that have a due time and were closed by it, as a share of those. */
  slaMet: number | null;
  /** Volume-weighted mean of whichever of the two rates above have data. `null` when neither does. */
  overall: number | null;
  ticketVolume: number;
  secondaryVolume: number;
  /** ticketVolume + secondaryVolume: what the minimum-volume rule checks. */
  volume: number;
}

// The owner stats endpoint also returns the on-time counts. They are optional here so this file
// keeps compiling whichever build of the API types is in place.
type TicketOwnerRow = OwnerStatsRow & { closedWithTat?: number; closedOnTime?: number };

const pct = (part: number, whole: number): number | null => (whole > 0 ? (part / whole) * 100 : null);

/** Weighted mean of rates, each weighted by how many items sit behind it. A 100% over 2 tickets
 *  no longer outweighs a 60% over 80 checklist items. */
export const weightedOverall = (parts: { rate: number | null; volume: number }[]): number | null => {
  let weighted = 0;
  let weight = 0;
  for (const { rate, volume } of parts) {
    if (rate == null || volume <= 0) continue;
    weighted += rate * volume;
    weight += volume;
  }
  return weight > 0 ? weighted / weight : null;
};

const ticketMetrics = (row: TicketOwnerRow | undefined) => {
  if (!row || row.total === 0) return { openIssues: 0, avgTat: null, slaMet: null, ticketCompletion: null, ticketVolume: 0 };
  return {
    openIssues: row.total - row.closed,
    avgTat: row.avgTatHours,
    slaMet: pct(row.closedOnTime ?? 0, row.closedWithTat ?? 0),
    ticketCompletion: pct(row.closed, row.total),
    ticketVolume: row.total,
  };
};

const buildRow = (
  id: string,
  name: string,
  ticket: TicketOwnerRow | undefined,
  secondaryRate: number | null,
  secondaryVolume: number,
): RankedRow => {
  const { ticketVolume, ...metrics } = ticketMetrics(ticket);
  return {
    id,
    name,
    ...metrics,
    secondaryRate,
    overall: weightedOverall([
      { rate: metrics.ticketCompletion, volume: ticketVolume },
      { rate: secondaryRate, volume: secondaryVolume },
    ]),
    ticketVolume,
    secondaryVolume,
    volume: ticketVolume + secondaryVolume,
  };
};

export interface RankedTable {
  /** Best overall first; rows with no figure last. */
  sorted: RankedRow[];
  topId: string | null;
  lowId: string | null;
}

/** Orders rows and decides who earns a badge. Pure, so callers memoise it on their rows. */
export const rankRows = (rows: RankedRow[]): RankedTable => {
  const sorted = [...rows].sort((a, b) => {
    if (a.overall == null && b.overall == null) return a.name.localeCompare(b.name);
    if (a.overall == null) return 1;
    if (b.overall == null) return -1;
    return b.overall - a.overall || b.volume - a.volume || a.name.localeCompare(b.name);
  });
  const eligible = sorted.filter((r) => r.overall != null && r.volume >= MIN_RANK_VOLUME);
  // A lone eligible row has nothing to be "top" of, but can still need attention.
  const top = eligible.length >= 2 ? eligible[0] : null;
  const worst = eligible[eligible.length - 1];
  const low = worst && worst.id !== top?.id && (worst.overall ?? 100) < NEEDS_ATTENTION_BELOW ? worst : null;
  return { sorted, topId: top?.id ?? null, lowId: low?.id ?? null };
};

/** The owner-level "who's top, who's low" ranking: by department (Tickets + Delegations) and by
 *  store (Tickets + Store checklists). Shared by the glance card on the Overview and the full
 *  Stores table, so both always show the same numbers. */
export const useOwnerRankings = (from?: string, to?: string) => {
  const { token } = useAuth();
  const departmentsQuery = useDepartmentsQuery();
  const storesQuery = useStoresQuery();
  const deptTicketsQuery = useTicketOwnerStatsQuery('department', from, to);
  const storeTicketsQuery = useTicketOwnerStatsQuery('store', from, to);
  const deptTasksQuery = useTaskOwnerStatsQuery('department', from, to);

  // One grouped request for every store, over the same from/to as the ticket figures beside it.
  // This replaced one request per store, which grew with the org and used each store's latest
  // bucket rather than the window being looked at.
  const storeChecklistQuery = useQuery({
    queryKey: ['analytics', 'checklist-by-store', from, to],
    queryFn: () => checklistInstanceApi.getComplianceByStore(from, to).then((r) => r.data),
    enabled: !!token,
    retry: handleQueryRetry,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const departments = departmentsQuery.data;
  const stores = storesQuery.data;
  const deptTicketRows = deptTicketsQuery.data;
  const storeTicketRows = storeTicketsQuery.data;
  const deptTaskRows = deptTasksQuery.data;
  const storeChecklistRows = storeChecklistQuery.data;

  const deptTicketsById = useMemo(() => new Map((deptTicketRows ?? []).map((r) => [r.ownerId, r as TicketOwnerRow])), [deptTicketRows]);
  const storeTicketsById = useMemo(() => new Map((storeTicketRows ?? []).map((r) => [r.ownerId, r as TicketOwnerRow])), [storeTicketRows]);
  const deptTasksById = useMemo(() => new Map<string | null, TaskOwnerStatsRow>((deptTaskRows ?? []).map((r) => [r.ownerId, r])), [deptTaskRows]);
  const storeChecklistById = useMemo(
    () => new Map<string, ChecklistStoreComplianceRow>((storeChecklistRows ?? []).map((r) => [r.storeId, r])),
    [storeChecklistRows],
  );

  // Deactivated departments and stores are not ranked: they are not coming back.
  const departmentRows: RankedRow[] = useMemo(
    () => (departments ?? [])
      .filter((dept) => dept.isActive !== false)
      .map((dept) => {
        const tasks = deptTasksById.get(dept.id);
        return buildRow(dept.id, dept.name, deptTicketsById.get(dept.id), tasks ? pct(tasks.done, tasks.total) : null, tasks?.total ?? 0);
      }),
    [departments, deptTicketsById, deptTasksById],
  );

  const storeRows: RankedRow[] = useMemo(
    () => (stores ?? [])
      .filter((store) => store.isActive !== false)
      .map((store) => {
        const checklist = storeChecklistById.get(store.id);
        return buildRow(store.id, store.name, storeTicketsById.get(store.id), checklist?.completionRate ?? null, checklist?.items ?? 0);
      }),
    [stores, storeTicketsById, storeChecklistById],
  );

  const departmentQueries = [departmentsQuery, deptTicketsQuery, deptTasksQuery];
  const storeQueries = [storesQuery, storeTicketsQuery, storeChecklistQuery];

  const retryDepartments = useCallback(() => {
    for (const q of [departmentsQuery, deptTicketsQuery, deptTasksQuery]) if (q.isError) void q.refetch();
  }, [departmentsQuery, deptTicketsQuery, deptTasksQuery]);
  const retryStores = useCallback(() => {
    for (const q of [storesQuery, storeTicketsQuery, storeChecklistQuery]) if (q.isError) void q.refetch();
  }, [storesQuery, storeTicketsQuery, storeChecklistQuery]);

  return {
    departmentRows,
    storeRows,
    departmentsPending: departmentQueries.some((q) => q.isPending),
    storesPending: storeQueries.some((q) => q.isPending),
    departmentsError: departmentQueries.some((q) => q.isError),
    storesError: storeQueries.some((q) => q.isError),
    /** A refetch is running with the previous rows still on screen. */
    departmentsFetching: departmentQueries.some((q) => q.isFetching),
    storesFetching: storeQueries.some((q) => q.isFetching),
    retryDepartments,
    retryStores,
  };
};
