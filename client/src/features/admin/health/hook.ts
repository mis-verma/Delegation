import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../context/AuthContext';
import { systemHealthApi } from '../../../api/systemHealth';
import { handleQueryRetry } from '../../../lib/queryHelpers';

export const useSystemHealthQuery = () => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['system-health'],
    queryFn: systemHealthApi.get,
    enabled: !!token,
    refetchInterval: 30_000,
    retry: handleQueryRetry,
  });
};
