import { useCallback } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import {
  ticketsBoardQueryOptions,
  departmentsQueryOptions,
  storesQueryOptions,
  assignableUsersQueryOptions,
} from '../features/tickets/hook';
import { categoriesQueryOptions } from '../features/settings/hook';
import { tagsQueryOptions } from '../features/tags/hook';

/**
 * Warms a route before the click lands: the lazy JS chunk and the page's main queries. Hover or
 * focus to click is typically 100-300ms, so most navigations then paint straight from cache with
 * no skeleton. Every entry reuses the page's own query options, so a prefetch and the page share
 * one cache entry; an already-fresh entry is skipped by prefetchQuery on its own staleTime.
 */
type Prefetcher = (queryClient: QueryClient) => void;

const PREFETCHERS: Record<string, Prefetcher> = {
  '/tickets': (qc) => {
    void import('../features/tickets/TicketList');
    void qc.prefetchQuery(ticketsBoardQueryOptions());
    void qc.prefetchQuery(departmentsQueryOptions());
    void qc.prefetchQuery(storesQueryOptions());
    void qc.prefetchQuery(assignableUsersQueryOptions());
    void qc.prefetchQuery(categoriesQueryOptions());
    void qc.prefetchQuery(tagsQueryOptions());
  },
};

// Same alias the router has: the admin copy of the page is the very same component.
PREFETCHERS['/admin/tickets'] = PREFETCHERS['/tickets'];

const hasSlowConnection = () => {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !!conn?.saveData;
};

export const usePrefetchRoute = () => {
  const queryClient = useQueryClient();
  const { token } = useAuth();
  return useCallback(
    (path: string) => {
      if (!token || hasSlowConnection()) return;
      PREFETCHERS[path]?.(queryClient);
    },
    [queryClient, token],
  );
};
