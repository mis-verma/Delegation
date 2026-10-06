import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { approvalTatApi } from '../../api/approvalTat';
import { handleQueryRetry } from '../../lib/queryHelpers';

// ADMIN/PC only: `enabled` is the caller's own role check, so other roles never fire the request.
export const useApprovalTatQuery = (from: string, to: string, enabled: boolean) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['reports', 'approval-tat', from, to],
    queryFn: () => approvalTatApi.get(from, to).then((r) => r.data),
    enabled: !!token && enabled,
    retry: handleQueryRetry,
    // Keep the last numbers on screen while another period loads.
    placeholderData: keepPreviousData,
  });
};
