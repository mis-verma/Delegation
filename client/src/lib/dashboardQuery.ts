import type { QueryClient } from '@tanstack/react-query';

// The Home dashboard is a glance screen: figures that are a minute old are fine, and a tab-focus
// refetch of a dozen widgets every time someone alt-tabs back is noise. The app-wide default is a
// 30s staleTime with focus refetch on, so the dashboard's own queries opt into these instead.
export const DASHBOARD_QUERY_OPTIONS = {
  staleTime: 60_000,
  refetchOnWindowFocus: false,
} as const;

export type DashboardQueryOptions = {
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
};

// Query-key roots the dashboard reads from. Refresh and pull-to-refresh invalidate just these, not
// every query in the cache (admin lists, settings and so on have nothing to do with the home screen).
export const DASHBOARD_QUERY_ROOTS: readonly string[] = ['tasks', 'tickets', 'todos', 'checklist-instances', 'events'];

export const invalidateDashboardQueries = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({
    predicate: (query) => {
      const root = query.queryKey[0];
      return typeof root === 'string' && DASHBOARD_QUERY_ROOTS.includes(root);
    },
  });
