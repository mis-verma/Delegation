import { useCallback } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import {
  ticketsBoardQueryOptions,
  departmentsQueryOptions,
  storesQueryOptions,
  assignableUsersQueryOptions,
} from '../features/tickets/hook';
import { tasksListQueryOptions, assignableUsersAllQueryOptions } from '../features/tasks/hook';
import { eventsQueryOptions } from '../features/events/hook';
import { usersQueryOptions } from '../features/admin/hook';
import { todosQueryOptions } from '../features/todo/hook';
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

PREFETCHERS['/tasks'] = (qc) => {
  void import('../features/tasks/TaskList');
  void qc.prefetchQuery(tasksListQueryOptions());
  void qc.prefetchQuery(assignableUsersAllQueryOptions());
  void qc.prefetchQuery(departmentsQueryOptions());
  void qc.prefetchQuery(storesQueryOptions());
  void qc.prefetchQuery(tagsQueryOptions());
};

PREFETCHERS['/todo'] = (qc) => {
  void import('../features/todo/TodoPage');
  void qc.prefetchQuery(todosQueryOptions());
};

PREFETCHERS['/events'] = (qc) => {
  void import('../features/events');
  void qc.prefetchQuery(eventsQueryOptions());
};

// The calendar lays out delegations, tickets and events on one grid, so it reads all three lists
// (default keys, the same ones the Delegation and Tickets pages use). Its checklist runs are left
// out: that query's key depends on a limit the page chooses itself.
PREFETCHERS['/calendar'] = (qc) => {
  void import('../features/calendar/CalendarPage');
  void qc.prefetchQuery(tasksListQueryOptions());
  void qc.prefetchQuery(ticketsBoardQueryOptions());
  void qc.prefetchQuery(eventsQueryOptions());
};

// The Admin link lands on People & Teams. The shared admin shell and that page are lazy chunks, and
// the page reads the roster, departments and stores.
PREFETCHERS['/admin/directory'] = (qc) => {
  void import('../features/admin/AdminLayout');
  void import('../features/admin/directory');
  void qc.prefetchQuery(usersQueryOptions());
  void qc.prefetchQuery(departmentsQueryOptions());
  void qc.prefetchQuery(storesQueryOptions());
};

// Checklists builds its list query from filters held in the page's own state (status tile, period,
// page), so a guessed key would miss and waste requests. Only the page code and the stable store
// and department lists are warmed.
PREFETCHERS['/checklists'] = (qc) => {
  void import('../features/checklist');
  void qc.prefetchQuery(storesQueryOptions());
  void qc.prefetchQuery(departmentsQueryOptions());
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
