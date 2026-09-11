import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { taskApi } from '../../../api/task';
import { ticketApi } from '../../../api/ticket';
import { checklistInstanceApi } from '../../../api/checklistInstances';
import { handleQueryRetry } from '../../../lib/queryHelpers';
import type { Role } from '../../../api/auth';
import type { OwnerStatsScope } from '../../../api/ticket';
import type { TaskOwnerStatsScope } from '../../../api/task';
import type { GroupBy } from './GroupByControl';

// Anyone who can view the merged Overview/Analytics page — org-wide for ADMIN/PC, department-
// scoped for MANAGER, store-scoped for SENIOR (each report scopes itself server-side off the
// caller's token, see reportScope.ts on the server).
const ORG_REPORT_ROLES: Role[] = ['ADMIN', 'PC', 'MANAGER', 'SENIOR'];
const canViewOrgReports = (role?: Role) => !!role && ORG_REPORT_ROLES.includes(role);

export const useTaskComplianceReportQuery = (groupBy: GroupBy, from?: string, to?: string) => {
  const { token, user } = useAuth();
  return useQuery({
    queryKey: ['analytics', 'task-compliance', groupBy, from, to],
    queryFn: () => taskApi.getComplianceReport(groupBy, from, to).then((r) => r.data),
    enabled: !!token && canViewOrgReports(user?.role),
    retry: handleQueryRetry,
  });
};

export const useTicketTatReportQuery = (groupBy: GroupBy, from?: string, to?: string) => {
  const { token, user } = useAuth();
  return useQuery({
    queryKey: ['analytics', 'ticket-tat', groupBy, from, to],
    queryFn: () => ticketApi.getTatReport(groupBy, from, to).then((r) => r.data),
    enabled: !!token && canViewOrgReports(user?.role),
    retry: handleQueryRetry,
  });
};

export const useChecklistInstanceComplianceReportQuery = (groupBy: GroupBy, from?: string, to?: string) => {
  const { token, user } = useAuth();
  return useQuery({
    queryKey: ['analytics', 'checklist-instance-compliance', groupBy, from, to],
    queryFn: () => checklistInstanceApi.getComplianceReport(groupBy, undefined, from, to).then((r) => r.data),
    enabled: !!token && canViewOrgReports(user?.role),
    retry: handleQueryRetry,
  });
};

// Backs the department/store ranking tables, the team leaderboard, and the org-wide on-time/
// overdue stat cards — see ticket.service.ts#ownerStats and api/ticket.ts#getOwnerStats for why
// this replaced reducing over a single newest-100-tickets page client-side.
export const useTicketOwnerStatsQuery = (scope: OwnerStatsScope, from?: string, to?: string) => {
  const { token, user } = useAuth();
  return useQuery({
    queryKey: ['analytics', 'ticket-owner-stats', scope, from, to],
    queryFn: () => ticketApi.getOwnerStats(scope, from, to).then((r) => r.data),
    enabled: !!token && canViewOrgReports(user?.role),
    retry: handleQueryRetry,
  });
};

// Same real GROUP BY aggregate approach as useTicketOwnerStatsQuery above, for delegations — see
// task.service.ts#ownerStats. Backs the department "Delegations" rate and the team leaderboard's
// per-user task counts, replacing a client-side reduce over the newest-200-tasks-org-wide page.
export const useTaskOwnerStatsQuery = (scope: TaskOwnerStatsScope, from?: string, to?: string) => {
  const { token, user } = useAuth();
  return useQuery({
    queryKey: ['analytics', 'task-owner-stats', scope, from, to],
    queryFn: () => taskApi.getOwnerStats(scope, from, to).then((r) => r.data),
    enabled: !!token && canViewOrgReports(user?.role),
    retry: handleQueryRetry,
  });
};
