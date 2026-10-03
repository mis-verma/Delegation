import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Refreshes what a saved decision changes: the checklist lists and detail pages (today's decisions
 * feed lives under the same key), the dashboard numbers and the audit trail. Resolves once the
 * lists are back, so the caller can keep a decided row hidden until then.
 */
export const useRefreshAfterDecision = () => {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['checklist-instances'] }),
      queryClient.invalidateQueries({ queryKey: ['analytics'] }),
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] }),
    ]);
  }, [queryClient]);
};
