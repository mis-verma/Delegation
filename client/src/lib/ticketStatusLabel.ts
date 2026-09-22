import type { TicketStatus } from '../api/ticket';

export const getTicketStatusLabel = (status: TicketStatus, viewerRole: string | undefined, realLabel: string) =>
  status === 'PENDING_APPROVAL' && viewerRole === 'USER' ? 'Under Review' : realLabel;
