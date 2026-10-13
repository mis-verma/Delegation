import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { ticketApi, type Ticket, type TicketStatus } from '../../api/ticket';
import { taskApi, type Task } from '../../api/task';
import { handleQueryRetry } from '../../lib/queryHelpers';
import type { TeamPeriodRange } from './teamDisplay';

// A safety stop: never more than this many pages per list, so a huge year cannot loop for ever.
const MAX_PAGES = 20;

// Every status that still needs work. Closed tickets and done delegations are finished; drafts are not
// real delegations yet, so none of them is "open now".
const OPEN_TICKET_STATUSES: readonly TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'PENDING_APPROVAL'];
const OPEN_TASK_STATUSES: readonly Task['status'][] = ['todo', 'in_progress', 'on_hold', 'pending_approval'];

/**
 * The open work behind the "Open now" figures on the Team Overview cards: every ticket and delegation that
 * is open today, whenever it was raised. The scores (Overall, Completion, On time) do NOT come from here:
 * they come from the scores report, the same numbers as the Scorecard. Only real delegations count (no
 * issues, no drafts).
 */
export const useTeamOpenWork = () => {
  const { token } = useAuth();

  const tickets = useQuery({
    queryKey: ['team', 'open-tickets'],
    queryFn: async (): Promise<Ticket[]> => {
      const all: Ticket[] = [];
      for (const status of OPEN_TICKET_STATUSES) {
        for (let page = 1; page <= MAX_PAGES; page++) {
          const res = await ticketApi.getAll(page, 500, status);
          all.push(...res.data);
          if (!res.meta?.hasNext) break;
        }
      }
      return all;
    },
    enabled: !!token,
    retry: handleQueryRetry,
    staleTime: 60_000,
  });

  const tasks = useQuery({
    queryKey: ['team', 'open-tasks'],
    queryFn: async (): Promise<Task[]> => {
      const all: Task[] = [];
      for (const status of OPEN_TASK_STATUSES) {
        for (let page = 1; page <= MAX_PAGES; page++) {
          const res = await taskApi.getAll(undefined, status, page, 200);
          all.push(...res.data.filter((t) => t.category === 'delegation'));
          if (!res.meta?.hasNext) break;
        }
      }
      return all;
    },
    enabled: !!token,
    retry: handleQueryRetry,
    staleTime: 60_000,
  });

  return { tickets, tasks };
};

/**
 * Every ticket and delegation created in the Team Overview's period, not just the first page, for the person
 * screen's category bars (a created-in-this-period count, labelled that way). Tickets are filtered by date on
 * the server; delegations come newest first, so pages are read until one reaches past the start of the period.
 * Only loads while a person screen is open.
 */
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
