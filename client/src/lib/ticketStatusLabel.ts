import type { TicketStatus } from '../api/ticket';

/**
 * The one set of ticket status names, the same for every role: the status chips, the status menu,
 * the history, the filters and the dialogs all read from here so they can't drift apart.
 */
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  ON_HOLD: 'On hold',
  PENDING_APPROVAL: 'Waiting for approval',
  CLOSED: 'Closed',
};

export const getTicketStatusLabel = (status: TicketStatus): string => TICKET_STATUS_LABEL[status] ?? status;
