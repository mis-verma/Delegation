import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { checklistDecisionApi } from '../../api/checklistDecisions';
import { handleQueryRetry } from '../../lib/queryHelpers';

export type { ChecklistDecision } from '../../api/checklistDecisions';

/**
 * Decisions feed for the verification queue: submit / approve / reject / send-back actions, newest
 * first. Defaults to today (org-local) on the server. The key sits under 'checklist-instances', so
 * the verify, send-back, submit and reopen mutations refresh it without extra wiring.
 */
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
