import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { ticketApi, type Ticket } from '../../api/ticket';
import { taskApi, type Task } from '../../api/task';
import { handleQueryRetry } from '../../lib/queryHelpers';
import type { TeamPeriodRange } from './teamDisplay';

const MAX_PAGES = 20;

export const useTeamPeriodWork = (range: Pick<TeamPeriodRange, 'startMs' | 'endMs'>, enabled: boolean) => {
  const { token } = useAuth();

  const tickets = useQuery({
    queryKey: ['team', 'tickets', range.startMs, range.endMs],
    queryFn: async (): Promise<Ticket[]> => {
      const from = new Date(range.startMs).toISOString();
      const to = new Date(range.endMs).toISOString();
      const all: Ticket[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const res = await ticketApi.getAll(page, 500, undefined, undefined, undefined, from, to, 'createdAt');
        all.push(...res.data);
        if (!res.meta?.hasNext) break;
      }
      return all;
    },
    enabled: !!token && enabled,
    retry: handleQueryRetry,
    staleTime: 2 * 60_000,
    placeholderData: keepPreviousData,
  });

  const tasks = useQuery({
    queryKey: ['team', 'tasks', range.startMs],
    queryFn: async (): Promise<Task[]> => {
      const all: Task[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const res = await taskApi.getAll(undefined, undefined, page, 200);
        all.push(...res.data);
        const oldest = res.data[res.data.length - 1];
        const reachedStart = !!oldest && Date.parse(oldest.createdAt) < range.startMs;
        if (!res.meta?.hasNext || reachedStart) break;
      }
      return all;
    },
    enabled: !!token && enabled,
    retry: handleQueryRetry,
    staleTime: 2 * 60_000,
    placeholderData: keepPreviousData,
  });

  return { tickets, tasks };
};
