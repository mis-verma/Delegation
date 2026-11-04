import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { exceptionApi } from '../../api/exceptions';
import { handleQueryRetry } from '../../lib/queryHelpers';
import { DASHBOARD_QUERY_OPTIONS } from '../../lib/dashboardQuery';

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

export const useExceptionTotalsQuery = () => {
  const { token } = useAuth();
  const allowed = useCanSeeExceptions();
  return useQuery({
    queryKey: ['exceptions', 'totals'] as const,
    queryFn: exceptionApi.totals,
    enabled: !!token && allowed,
    retry: handleQueryRetry,
    ...DASHBOARD_QUERY_OPTIONS,
  });
};

