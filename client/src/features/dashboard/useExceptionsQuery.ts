import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { exceptionApi } from '../../api/exceptions';
import { handleQueryRetry } from '../../lib/queryHelpers';
import { DASHBOARD_QUERY_OPTIONS } from '../../lib/dashboardQuery';
import { useAttentionPeople } from '../attention/useAttention';
import { useApprovalSources } from './useApprovalSources';

export const useCanSeeExceptions = () => {
  const { user } = useAuth();
  const role = user?.role;
  return role === 'ADMIN' || role === 'PC' || role === 'OWNER' || role === 'MANAGER' || role === 'SENIOR';
};

export const useExceptionsQuery = () => {
  const { token } = useAuth();
  const allowed = useCanSeeExceptions();
  return useQuery({
    queryKey: ['exceptions'] as const,
    queryFn: exceptionApi.list,
    enabled: !!token && allowed,
    retry: handleQueryRetry,
    ...DASHBOARD_QUERY_OPTIONS,
  });
};

export const useTeamReviewCount = (enabled: boolean, includeApprovals: boolean) => {
  const approvals = useApprovalSources();
  const exceptions = useExceptionsQuery();
  const people = useAttentionPeople();
  if (!enabled) return 0;
  return (includeApprovals ? approvals.total : 0) + (exceptions.data?.length ?? 0) + (people.data?.length ?? 0);
};
