import type { QueryClient } from '@tanstack/react-query';

export const DASHBOARD_QUERY_OPTIONS = {
  staleTime: 60_000,
  refetchOnWindowFocus: false,
} as const;

export type DashboardQueryOptions = {
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
};

export const DASHBOARD_QUERY_ROOTS: readonly string[] = ['tasks', 'tickets', 'todos', 'checklist-instances', 'events', 'dashboard', 'exceptions', 'scores'];

export const invalidateDashboardQueries = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({
    predicate: (query) => {
      const root = query.queryKey[0];
      return typeof root === 'string' && DASHBOARD_QUERY_ROOTS.includes(root);
    },
  });
