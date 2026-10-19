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

PREFETCHERS['/calendar'] = (qc) => {
  void import('../features/calendar/CalendarPage');
  void qc.prefetchQuery(tasksListQueryOptions());
  void qc.prefetchQuery(ticketsBoardQueryOptions());
  void qc.prefetchQuery(eventsQueryOptions());
};

PREFETCHERS['/admin/directory'] = (qc) => {
  void import('../features/admin/AdminLayout');
  void import('../features/admin/directory');
  void qc.prefetchQuery(usersQueryOptions());
  void qc.prefetchQuery(departmentsQueryOptions());
  void qc.prefetchQuery(storesQueryOptions());
};

PREFETCHERS['/checklists'] = (qc) => {
  void import('../features/checklist');
  void qc.prefetchQuery(storesQueryOptions());
  void qc.prefetchQuery(departmentsQueryOptions());
};

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
