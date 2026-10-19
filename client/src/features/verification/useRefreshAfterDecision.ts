import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateScoreCaches } from '../../lib/queryHelpers';

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
