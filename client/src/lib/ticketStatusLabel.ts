import type { TicketStatus } from '../api/ticket';

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  ON_HOLD: 'On hold',
  PENDING_APPROVAL: 'Waiting for approval',
  CLOSED: 'Closed',
};

export const getTicketStatusLabel = (status: TicketStatus): string => TICKET_STATUS_LABEL[status] ?? status;
