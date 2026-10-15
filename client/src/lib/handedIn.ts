import type { Ticket } from '../api/ticket';
import type { Task } from '../api/task';

// "Done" for the assignee: handed in (waiting for approval) or approved. The scores count it that way, so the
// tiles, lists and drill-downs use the same rule and a tile can never disagree with the score or the list it opens.
export const isTicketHandedIn = (t: Pick<Ticket, 'status'>): boolean => t.status === 'CLOSED' || t.status === 'PENDING_APPROVAL';
export const isTaskHandedIn = (t: Pick<Task, 'status'>): boolean => t.status === 'done' || t.status === 'pending_approval';
