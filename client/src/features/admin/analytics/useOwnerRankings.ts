import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { useDepartmentsQuery, useStoresQuery } from '../../tickets/hook';
import { checklistInstanceApi } from '../../../api/checklistInstances';
import { useTicketOwnerStatsQuery, useTaskOwnerStatsQuery } from './useAnalyticsQueries';
import type { GroupBy } from './GroupByControl';
import type { OwnerStatsRow } from '../../../api/ticket';
import type { TaskOwnerStatsRow } from '../../../api/task';

export interface RankedRow {
  id: string;
  name: string;
  ticketCompletion: number | null;
  /** Delegation completion for the Departments cut, real per-store checklist completion for the
   *  Stores cut — which one depends on which array this row came from. */
  secondaryRate: number | null;
  openIssues: number;
  avgTat: number | null;
  slaMet: number | null;
  /** The combined "how's this entity doing overall" figure — average of whichever of
   *  {ticket completion, secondary rate} actually have data for this row. `null` when neither
   *  does, so a row with zero volume doesn't rank as the worst purely for having nothing to show. */
  overall: number | null;
}

export const average = (values: (number | null)[]): number | null => {
  const real = values.filter((v): v is number => v != null);
  return real.length > 0 ? Math.round(real.reduce((sum, v) => sum + v, 0) / real.length) : null;
};

// Real per-owner row from the server aggregate (ticket.service.ts#ownerStats), reshaped into the
// same {openIssues, avgTat, slaMet, ticketCompletion} the ranking tables already render — `row`
// is undefined for an owner with zero tickets in scope (the aggregate only returns rows that
// exist), which reads the same as "no tickets" did under the old client-side filter.
const ticketMetrics = (row: OwnerStatsRow | undefined) => {
  if (!row || row.total === 0) return { openIssues: 0, avgTat: null, slaMet: null, ticketCompletion: null };
  return {
    openIssues: row.total - row.closed,
    avgTat: row.avgTatHours,
    slaMet: Math.round(((row.total - row.overdueCount) / row.total) * 100),
    ticketCompletion: Math.round((row.closed / row.total) * 100),
  };
};

// Same idea as ticketMetrics above but for the task/delegation aggregate (task.service.ts#ownerStats)
// — `undefined` (no rows for this department) reads the same as "no delegations".
const delegationRateOf = (row: TaskOwnerStatsRow | undefined): number | null =>
  row && row.total > 0 ? Math.round((row.done / row.total) * 100) : null;

/** The owner-level "who's top, who's low" ranking — by department (Tickets + Delegations) and by
 *  store (Tickets + real Checklist compliance). Pulled out of StoresPerformanceSection so the same
 *  real numbers can also back a compact glance-able card on the dashboard itself, not just the
 *  full table buried a tab-click away. */
export const useOwnerRankings = (groupBy: GroupBy, from?: string, to?: string) => {
  const { token } = useAuth();
  const { data: departments = [], isPending: departmentsPending, isError: departmentsError } = useDepartmentsQuery();
  const { data: stores = [], isPending: storesPending, isError: storesError } = useStoresQuery();
  // Real GROUP BY aggregates, one row per department/store — not a client-side reduce over a
  // capped ticket page, which silently mis-scored any department/store whose tickets weren't
  // among the org's newest 100 (see ticket.service.ts#ownerStats).
  const { data: deptTicketRows = [], isPending: deptTicketsPending, isError: deptTicketsError } = useTicketOwnerStatsQuery('department', from, to);
  const { data: storeTicketRows = [], isPending: storeTicketsPending, isError: storeTicketsError } = useTicketOwnerStatsQuery('store', from, to);
  // Same fix, applied to delegations — was a client-side reduce over the newest 200 tasks
  // org-wide with no date-range filtering at all (see task.service.ts#ownerStats).
  const { data: deptTaskRows = [], isPending: deptTasksPending, isError: deptTasksError } = useTaskOwnerStatsQuery('department', from, to);

  const deptTicketsById = useMemo(() => new Map(deptTicketRows.map((r) => [r.ownerId, r])), [deptTicketRows]);
  const storeTicketsById = useMemo(() => new Map(storeTicketRows.map((r) => [r.ownerId, r])), [storeTicketRows]);
  const deptTasksById = useMemo(() => new Map(deptTaskRows.map((r) => [r.ownerId, r])), [deptTaskRows]);

  // Real per-store checklist completion — one small parallel request per store (checklist
  // instances only carry a storeId, not a departmentId, so this is the one place that figure can
  // be computed honestly). Small org, small N; each request is the same lightweight bucketed
  // report the org-wide audit score already uses, just scoped to one store.
  const storeChecklistQueries = useQueries({
    queries: stores.map((store) => ({
      queryKey: ['analytics', 'checklist-instance-compliance', store.id, groupBy, from, to],
      queryFn: () => checklistInstanceApi.getComplianceReport(groupBy, store.id, from, to).then((r) => r.data),
      enabled: !!token,
    })),
  });
  const storeChecklistPending = storeChecklistQueries.some((q) => q.isPending);
  const storeChecklistError = storeChecklistQueries.some((q) => q.isError);
  const storeChecklistRate = useMemo(() => {
    const map = new Map<string, number | null>();
    stores.forEach((store, i) => {
      const rows = storeChecklistQueries[i]?.data;
      const latest = rows?.[rows.length - 1];
      map.set(store.id, latest?.completionRate != null ? Math.round(latest.completionRate) : null);
    });
    return map;
  }, [stores, storeChecklistQueries]);

  const departmentRows: RankedRow[] = useMemo(
    () => departments.map((dept) => {
      const { openIssues, avgTat, slaMet, ticketCompletion } = ticketMetrics(deptTicketsById.get(dept.id));
      const secondaryRate = delegationRateOf(deptTasksById.get(dept.id));
      return {
        id: dept.id,
        name: dept.name,
        ticketCompletion,
        secondaryRate,
        openIssues,
        avgTat,
        slaMet,
        overall: average([ticketCompletion, secondaryRate]),
      };
    }),
    [departments, deptTicketsById, deptTasksById],
  );

  const storeRows: RankedRow[] = useMemo(
    () => stores.map((store) => {
      const { openIssues, avgTat, slaMet, ticketCompletion } = ticketMetrics(storeTicketsById.get(store.id));
      const secondaryRate = storeChecklistRate.get(store.id) ?? null;
      return {
        id: store.id,
        name: store.name,
        ticketCompletion,
        secondaryRate,
        openIssues,
        avgTat,
        slaMet,
        overall: average([ticketCompletion, secondaryRate]),
      };
    }),
    [stores, storeTicketsById, storeChecklistRate],
  );

  return {
    departmentRows,
    storeRows,
    departmentsPending: departmentsPending || deptTicketsPending || deptTasksPending,
    storesPending: storesPending || storeTicketsPending || storeChecklistPending,
    departmentsError: departmentsError || deptTicketsError || deptTasksError,
    storesError: storesError || storeTicketsError || storeChecklistError,
  };
};
