import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { checklistDecisionApi } from '../../api/checklistDecisions';
import { handleQueryRetry } from '../../lib/queryHelpers';

export type { ChecklistDecision } from '../../api/checklistDecisions';

export const useChecklistDecisionsQuery = (params: { from?: string; to?: string; limit?: number } = {}) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['checklist-instances', 'decisions', params.from ?? null, params.to ?? null, params.limit ?? null],
    queryFn: () => checklistDecisionApi.list(params),
    enabled: !!token,
    retry: handleQueryRetry,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
};
