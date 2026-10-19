import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOrgToday } from './useOrgToday';
import { invalidateScoreCaches } from '../../lib/queryHelpers';

export const useRefreshOnNewDay = () => {
  const today = useOrgToday();
  const queryClient = useQueryClient();
  const seen = useRef(today);
  useEffect(() => {
    if (seen.current === today) return;
    seen.current = today;
    void queryClient.invalidateQueries({ queryKey: ['checklist-instances'] });
    invalidateScoreCaches(queryClient);
  }, [today, queryClient]);
};
