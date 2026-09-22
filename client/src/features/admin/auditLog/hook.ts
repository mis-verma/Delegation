import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { auditLogApi, type AuditLogFilter } from '../../../api/auditLogs';
import { handleQueryRetry } from '../../../lib/queryHelpers';

const KEYS = {
  list: (filter: AuditLogFilter) => ['audit-logs', filter] as const,
};

// `enabled` lets a caller that already knows the query shouldn't run yet (e.g. ActivityTimeline
// gating on the viewer's role, which this hook has no way to know on its own) suppress it without
// breaking the rules of hooks by conditionally calling this at all.
export const useAuditLogsQuery = (filter: AuditLogFilter = {}, options: { enabled?: boolean } = {}) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: KEYS.list(filter),
    queryFn: () => auditLogApi.list(filter),
    enabled: !!token && (options.enabled ?? true),
    retry: handleQueryRetry,
  });
};
