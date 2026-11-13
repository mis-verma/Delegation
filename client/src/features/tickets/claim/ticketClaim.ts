import type { Ticket } from '../../../api/ticket';
import type { Role } from '../../../api/auth';

type ClaimFields = Pick<Ticket, 'claimOpenedAt' | 'assigneeId' | 'status' | 'awaitingHeadApproval' | 'declinedAt'> & Partial<Pick<Ticket, 'claimedAt'>>;
type Claimer = { id?: string; role: Role; departmentId?: string | null } | null | undefined;

export const isClaimable = (ticket: ClaimFields): boolean =>
  !!ticket.claimOpenedAt && !ticket.assigneeId && ticket.status === 'OPEN' && !ticket.awaitingHeadApproval && !ticket.declinedAt;

export const isAwaitingClaim = (ticket: ClaimFields): boolean =>
  !!ticket.claimOpenedAt && !ticket.claimedAt && ticket.status === 'OPEN' && !ticket.awaitingHeadApproval && !ticket.declinedAt;

export const isAwaitingAssigneeClaim = (ticket: ClaimFields): boolean => isAwaitingClaim(ticket) && !!ticket.assigneeId;

export const canClaim = (user: Claimer, ticket: ClaimFields & Pick<Ticket, 'departmentId'>): boolean => {
  if (!user || user.role === 'OWNER') return false;
  if (isAwaitingAssigneeClaim(ticket)) return !!user.id && ticket.assigneeId === user.id;
  return !!user.departmentId && user.departmentId === ticket.departmentId && isClaimable(ticket);
};

export const wholeHours = (hours: number | null | undefined): number | null => (hours ? Math.max(1, Math.round(hours)) : null);

export const tatText = (hours: number | null | undefined): string | null => {
  if (!hours) return null;
  if (hours % 24 === 0) return `${hours / 24} ${hours === 24 ? 'day' : 'days'}`;
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
};

export const headApproveLabel = (hasPerson: boolean): string => (hasPerson ? 'Set time and assign' : 'Set time, open to claim');
