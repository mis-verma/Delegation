import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { dashboardApi } from '../../api/dashboard';
import { handleQueryRetry } from '../../lib/queryHelpers';
import { DASHBOARD_QUERY_OPTIONS } from '../../lib/dashboardQuery';

export const useMyApprovalsQuery = (enabled = true) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['dashboard', 'my-approvals'] as const,
    queryFn: () => dashboardApi.myApprovals(),
    enabled: !!token && enabled,
    retry: handleQueryRetry,
    ...DASHBOARD_QUERY_OPTIONS,
    staleTime: 15_000,
  });
};
