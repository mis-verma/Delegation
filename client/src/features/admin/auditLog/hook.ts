import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { auditLogApi, type AuditLogFilter } from '../../../api/auditLogs';
import { handleQueryRetry } from '../../../lib/queryHelpers';

const KEYS = {
  list: (filter: AuditLogFilter) => ['audit-logs', filter] as const,
};

export const useAuditLogsQuery = (filter: AuditLogFilter = {}, options: { enabled?: boolean; keepPrevious?: boolean } = {}) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: KEYS.list(filter),
    queryFn: () => auditLogApi.list(filter),
    enabled: !!token && (options.enabled ?? true),
    retry: handleQueryRetry,
    placeholderData: options.keepPrevious ? keepPreviousData : undefined,
  });
};
