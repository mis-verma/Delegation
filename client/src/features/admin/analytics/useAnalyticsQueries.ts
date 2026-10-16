import { useCallback, useState } from 'react';
import { keepPreviousData, useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { taskApi } from '../../../api/task';
import { ticketApi } from '../../../api/ticket';
import { checklistInstanceApi } from '../../../api/checklistInstances';
import { handleQueryRetry } from '../../../lib/queryHelpers';
import type { Role } from '../../../api/auth';
import type { OwnerStatsScope } from '../../../api/ticket';
import type { TaskOwnerStatsScope } from '../../../api/task';
import type { GroupBy } from './GroupByControl';

/** The Day/Week/Month/Year choice, or 'none' for one bucket that covers the whole from/to range. */
export type ReportGroupBy = GroupBy | 'none';

// Anyone who can view the merged Overview/Analytics page: org-wide for ADMIN/PC, department-
// scoped for MANAGER, store-scoped for SENIOR (each report scopes itself server-side off the
// caller's token, see reportScope.ts on the server).
const ORG_REPORT_ROLES: Role[] = ['ADMIN', 'PC', 'MANAGER', 'SENIOR'];
const canViewOrgReports = (role?: Role) => !!role && ORG_REPORT_ROLES.includes(role);

/** Every report on this page shares one cache namespace, so a single invalidation refreshes all. */
export const ANALYTICS_QUERY_KEY = ['analytics'] as const;

// One set of cache rules for every query on the page. Keep the previous numbers on screen while a
// new period loads (the sections dim them instead of flashing a skeleton), do not refetch just
// because the tab regained focus, and treat a minute-old answer as fresh: these are aggregates, not
// a live feed. Retry skips 4xx, which no retry can fix.
const REPORT_OPTIONS = {
  placeholderData: keepPreviousData,
  retry: handleQueryRetry,
  staleTime: 60_000,
  refetchOnWindowFocus: false,
} as const;

export const useTaskComplianceReportQuery = (groupBy: ReportGroupBy, from?: string, to?: string) => {
  const { token, user } = useAuth();
  return useQuery({
    queryKey: ['analytics', 'task-compliance', groupBy, from, to],
    queryFn: () => taskApi.getComplianceReport(groupBy, from, to).then((r) => r.data),
    enabled: !!token && canViewOrgReports(user?.role),
    ...REPORT_OPTIONS,
  });
};

export const useTicketTatReportQuery = (groupBy: ReportGroupBy, from?: string, to?: string) => {
  const { token, user } = useAuth();
  return useQuery({
    queryKey: ['analytics', 'ticket-tat', groupBy, from, to],
    queryFn: () => ticketApi.getTatReport(groupBy, from, to).then((r) => r.data),
    enabled: !!token && canViewOrgReports(user?.role),
    ...REPORT_OPTIONS,
  });
};

/** Optional store / person narrow the whole report; omit both for the org-wide (or role-scoped) figures. */
export interface ChecklistReportFilters {
  includeDeleted?: boolean;
  storeId?: string;
  assigneeId?: string;
}

export const useChecklistInstanceComplianceReportQuery = (groupBy: ReportGroupBy, from?: string, to?: string, filters: ChecklistReportFilters = {}) => {
  const { includeDeleted, storeId, assigneeId } = filters;
  const { token, user } = useAuth();
  return useQuery({
    queryKey: ['analytics', 'checklist-instance-compliance', groupBy, from, to, includeDeleted, storeId, assigneeId],
    queryFn: () => checklistInstanceApi.getComplianceReport(groupBy, storeId, from, to, includeDeleted, assigneeId).then((r) => r.data),
    enabled: !!token && canViewOrgReports(user?.role),
    ...REPORT_OPTIONS,
  });
};

// Backs the department/store ranking tables, the team leaderboard, and the org-wide overdue stat:
// see ticket.service.ts#ownerStats and api/ticket.ts#getOwnerStats for why this replaced reducing
// over a single newest-100-tickets page client-side.
export const useTicketOwnerStatsQuery = (scope: OwnerStatsScope, from?: string, to?: string) => {
  const { token, user } = useAuth();
  return useQuery({
    queryKey: ['analytics', 'ticket-owner-stats', scope, from, to],
    queryFn: () => ticketApi.getOwnerStats(scope, from, to).then((r) => r.data),
    enabled: !!token && canViewOrgReports(user?.role),
    ...REPORT_OPTIONS,
  });
};

// Same real GROUP BY aggregate approach as useTicketOwnerStatsQuery above, for delegations: see
// task.service.ts#ownerStats. Backs the department "Delegations" rate and the team leaderboard's
// per-user task counts, replacing a client-side reduce over the newest-200-tasks-org-wide page.
export const useTaskOwnerStatsQuery = (scope: TaskOwnerStatsScope, from?: string, to?: string) => {
  const { token, user } = useAuth();
  return useQuery({
    queryKey: ['analytics', 'task-owner-stats', scope, from, to],
    queryFn: () => taskApi.getOwnerStats(scope, from, to).then((r) => r.data),
    enabled: !!token && canViewOrgReports(user?.role),
    ...REPORT_OPTIONS,
  });
};

// ---------------------------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------------------------

/**
 * "Updated 10:42" plus a Refresh action for the whole page. `updatedAt` is the newest successful
 * report fetch in the shared analytics cache; `refresh` invalidates that whole namespace.
 */
export const useAnalyticsRefresh = () => {
  const queryClient = useQueryClient();
  // Subscribes this hook to fetch start/end, which is exactly when the newest dataUpdatedAt can
  // change, so reading the cache during render below stays current.
  useIsFetching({ queryKey: ANALYTICS_QUERY_KEY });
  // True only while a Refresh the viewer asked for is running, so the "Updating" announcement is
  // not read out every time a background refetch (a socket invalidation, a tab change) happens.
  const [isRefreshing, setIsRefreshing] = useState(false);

  const updatedAt = queryClient
    .getQueryCache()
    .findAll({ queryKey: ANALYTICS_QUERY_KEY })
    .reduce((latest, q) => (q.state.status === 'success' && q.state.dataUpdatedAt > latest ? q.state.dataUpdatedAt : latest), 0);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // The name lookups the page also shows (the scope notice, ranking rows, the organisation
      // counts) live outside the analytics namespace, so they are refreshed alongside it. Keys
      // match useDepartmentsQuery, useStoresQuery and useUsersQuery.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ANALYTICS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ['departments'] }),
        queryClient.invalidateQueries({ queryKey: ['stores'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
        // Scores (leaders, leaderboard, scorecard, rankings) live under their own root.
        queryClient.invalidateQueries({ queryKey: ['scores'] }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient]);

  return { updatedAt: updatedAt > 0 ? updatedAt : null, isRefreshing, refresh };
};
