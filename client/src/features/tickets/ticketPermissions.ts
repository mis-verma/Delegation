import type { Role } from '../../api/auth';
import type { Ticket } from '../../api/ticket';

/**
 * Who may change a ticket: edit its text, add photos, or move its status. Mirrors the server's
 * assertCanMutate (ticket.service.ts) rule for rule:
 * - Admin and PC: any ticket.
 * - Manager: a ticket in their own department or their own store.
 * - Senior: a ticket in their own store.
 * - Agent and user: a ticket they raised or were assigned.
 * - Anyone else (an approval manager): none.
 * The server stays the real gate; this only stops the UI offering something that would come back as a 403.
 */
export const canChangeTicket = (
  user: { id: string; role: Role; departmentId?: string | null; storeId?: string | null } | null | undefined,
  ticket: Pick<Ticket, 'assigneeId' | 'userId' | 'departmentId' | 'storeId'>,
): boolean => {
  if (!user) return false;
  if (user.role === 'ADMIN' || user.role === 'PC') return true;
  if (user.role === 'AGENT' || user.role === 'USER') return ticket.assigneeId === user.id || ticket.userId === user.id;
  const sameStore = !!user.storeId && ticket.storeId === user.storeId;
  if (user.role === 'MANAGER') return sameStore || (!!user.departmentId && ticket.departmentId === user.departmentId);
  if (user.role === 'SENIOR') return sameStore;
  return false;
};

/**
 * The person who raised a ticket can take it back while nobody has started on it: still Open and
 * never moved. Same rule as ticket.service.ts#remove. Admin and PC delete through their own button.
 */
export const canWithdrawTicket = (
  user: { id: string; role: Role } | null | undefined,
  ticket: Pick<Ticket, 'userId' | 'status' | 'statusUpdates'>,
): boolean =>
  !!user
  && user.role !== 'ADMIN' && user.role !== 'PC'
  && ticket.userId === user.id
  && ticket.status === 'OPEN'
  && (ticket.statusUpdates?.length ?? 0) === 0;
