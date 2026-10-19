import type { Ticket } from '../api/ticket';
import type { Task } from '../api/task';

export const isTicketHandedIn = (t: Pick<Ticket, 'status'>): boolean => t.status === 'CLOSED' || t.status === 'PENDING_APPROVAL';
export const isTaskHandedIn = (t: Pick<Task, 'status'>): boolean => t.status === 'done' || t.status === 'pending_approval';
