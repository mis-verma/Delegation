import type { Role } from '../../api/auth';
import type { Ticket } from '../../api/ticket';

/**
 * Who may change a ticket: edit its text, add photos, or move its status. Mirrors the server's
 * assertCanMutate (ticket.service.ts) as far as the client can know it: Admin, PC and managers
 * (the server narrows managers and seniors to their own department/store), and an agent or user
 * only on a ticket they raised or were assigned. The server stays the real gate; this only stops
 * the UI offering something that would come back as a 403.
 */
export const canChangeTicket = (
  user: { id: string; role: Role } | null | undefined,
  ticket: Pick<Ticket, 'assigneeId' | 'userId'>,
): boolean => {
  if (!user) return false;
  if (user.role === 'AGENT' || user.role === 'USER') return ticket.assigneeId === user.id || ticket.userId === user.id;
  return user.role === 'ADMIN' || user.role === 'PC' || user.role === 'MANAGER';
};
