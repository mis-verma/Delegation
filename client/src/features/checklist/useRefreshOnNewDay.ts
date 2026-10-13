import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOrgToday } from './useOrgToday';
import { invalidateScoreCaches } from '../../lib/queryHelpers';

/**
 * Refetches every checklist query the moment the org's calendar day changes while the page is open.
 * Without it a screen left up overnight keeps yesterday's runs, chips and overdue state until
 * something else refetches, and a tick on a run that is now locked fails with a 400.
 */
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
