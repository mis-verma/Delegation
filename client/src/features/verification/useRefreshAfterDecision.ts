import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateScoreCaches } from '../../lib/queryHelpers';

/**
 * Refreshes what a saved decision changes: the checklist, ticket and delegation lists and detail pages
 * (today's decisions feed lives under the checklist key), the dashboard numbers and the audit trail. Resolves once the
 * lists are back, so the caller can keep a decided row hidden until then.
 */
export const useRefreshAfterDecision = () => {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['checklist-instances'] }),
      queryClient.invalidateQueries({ queryKey: ['tickets'] }),
      queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['analytics'] }),
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] }),
      invalidateScoreCaches(queryClient),
    ]);
  }, [queryClient]);
};
