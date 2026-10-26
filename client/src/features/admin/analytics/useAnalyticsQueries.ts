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

export type ReportGroupBy = GroupBy | 'none';

const ORG_REPORT_ROLES: Role[] = ['ADMIN', 'PC', 'OWNER', 'MANAGER', 'SENIOR'];
const canViewOrgReports = (role?: Role) => !!role && ORG_REPORT_ROLES.includes(role);

export const ANALYTICS_QUERY_KEY = ['analytics'] as const;

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

export const useTicketOwnerStatsQuery = (scope: OwnerStatsScope, from?: string, to?: string) => {
  const { token, user } = useAuth();
  return useQuery({
    queryKey: ['analytics', 'ticket-owner-stats', scope, from, to],
    queryFn: () => ticketApi.getOwnerStats(scope, from, to).then((r) => r.data),
    enabled: !!token && canViewOrgReports(user?.role),
    ...REPORT_OPTIONS,
  });
};

export const useTaskOwnerStatsQuery = (scope: TaskOwnerStatsScope, from?: string, to?: string) => {
  const { token, user } = useAuth();
  return useQuery({
    queryKey: ['analytics', 'task-owner-stats', scope, from, to],
    queryFn: () => taskApi.getOwnerStats(scope, from, to).then((r) => r.data),
    enabled: !!token && canViewOrgReports(user?.role),
    ...REPORT_OPTIONS,
  });
};

export const useAnalyticsRefresh = () => {
  const queryClient = useQueryClient();
  useIsFetching({ queryKey: ANALYTICS_QUERY_KEY });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const updatedAt = queryClient
    .getQueryCache()
    .findAll({ queryKey: ANALYTICS_QUERY_KEY })
    .reduce((latest, q) => (q.state.status === 'success' && q.state.dataUpdatedAt > latest ? q.state.dataUpdatedAt : latest), 0);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ANALYTICS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ['departments'] }),
        queryClient.invalidateQueries({ queryKey: ['stores'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
        queryClient.invalidateQueries({ queryKey: ['scores'] }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient]);

  return { updatedAt: updatedAt > 0 ? updatedAt : null, isRefreshing, refresh };
};
