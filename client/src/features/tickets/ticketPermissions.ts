import type { Role } from '../../api/auth';
import type { Ticket } from '../../api/ticket';

export const canChangeTicket = (
  user: { id: string; role: Role; departmentId?: string | null; storeId?: string | null } | null | undefined,
  ticket: Pick<Ticket, 'assigneeId' | 'userId' | 'departmentId' | 'storeId'> & Partial<Pick<Ticket, 'declinedAt' | 'awaitingHeadApproval'>>,
): boolean => {
  if (!user) return false;
  if (ticket.declinedAt) return false;
  if (user.role === 'ADMIN' || user.role === 'PC') return true;
  if (ticket.awaitingHeadApproval) return false;
  if (user.role === 'AGENT' || user.role === 'USER') return ticket.assigneeId === user.id || ticket.userId === user.id;
  const sameStore = !!user.storeId && ticket.storeId === user.storeId;
  if (user.role === 'MANAGER') return sameStore || (!!user.departmentId && ticket.departmentId === user.departmentId);
  if (user.role === 'SENIOR') return sameStore;
  return false;
};

export const canWithdrawTicket = (
  user: { id: string; role: Role } | null | undefined,
  ticket: Pick<Ticket, 'userId' | 'status' | 'statusUpdates'>,
): boolean =>
  !!user
  && user.role !== 'ADMIN' && user.role !== 'PC'
  && ticket.userId === user.id
  && ticket.status === 'OPEN'
  && (ticket.statusUpdates?.length ?? 0) === 0;
