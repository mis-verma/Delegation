import type { Ticket } from '../../api/ticket';
import type { Task } from '../../api/task';
import type { SortKey } from './verificationModel';

// Store / person / age / search for the ticket and delegation side of the queue. Tasks carry no
// store, so any store filter leaves them out, the same rule the page always had.

export interface TicketTaskFilter {
  store: string | null;
  person: string | null;
  /** Items created at or before this time; null = any age. */
  cutoff: number | null;
  /** Lower-cased search text. */
  needle: string;
  personNameById: ReadonlyMap<string, string>;
  storeNameById: ReadonlyMap<string, string>;
}

export const filterTickets = (tickets: Ticket[], f: TicketTaskFilter): Ticket[] =>
  tickets.filter((t) =>
    (!f.store || t.storeId === f.store) &&
    (!f.person || t.assigneeId === f.person) &&
    (f.cutoff == null || new Date(t.createdAt).getTime() <= f.cutoff) &&
    (!f.needle || [t.title, t.assignee?.firstName, t.storeId ? f.storeNameById.get(t.storeId) : null]
      .some((text) => !!text && text.toLowerCase().includes(f.needle))),
  );

export const filterTasks = (tasks: Task[], f: TicketTaskFilter): Task[] =>
  tasks.filter((t) =>
    !f.store &&
    (!f.person || t.assigneeId === f.person) &&
    (f.cutoff == null || new Date(t.createdAt).getTime() <= f.cutoff) &&
    (!f.needle || [t.title, t.assigneeId ? f.personNameById.get(t.assigneeId) : null]
      .some((text) => !!text && text.toLowerCase().includes(f.needle))),
  );

/** Oldest first by default; "Newest" flips it. Compliance and overdue only apply to checklists. */
export const sortByCreated = <T extends { createdAt: string }>(items: T[], sort: SortKey): T[] => {
  const dir = sort === 'newest' ? -1 : 1;
  return [...items].sort((a, b) => dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
};

export const oldestCreated = (items: { createdAt: string }[]): number | null =>
  items.length ? Math.min(...items.map((i) => new Date(i.createdAt).getTime())) : null;
