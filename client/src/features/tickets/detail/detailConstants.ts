import type { TicketStatus, RestrictedStatus } from '../../../api/ticket';
import { TICKET_STATUS_LABEL } from '../../../lib/ticketStatusLabel';

/** The hand-in action's name everywhere it is offered: the status menu, the dialog and its button. */
export const HAND_IN_LABEL = 'Mark completed';

export const STATUS_UPDATE_OPTIONS: { value: RestrictedStatus; label: string }[] = [
  { value: 'IN_PROGRESS', label: TICKET_STATUS_LABEL.IN_PROGRESS },
  { value: 'ON_HOLD', label: TICKET_STATUS_LABEL.ON_HOLD },
  { value: 'PENDING_APPROVAL', label: HAND_IN_LABEL },
];

export const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: 'OPEN', label: TICKET_STATUS_LABEL.OPEN },
  { value: 'IN_PROGRESS', label: TICKET_STATUS_LABEL.IN_PROGRESS },
  { value: 'PENDING_APPROVAL', label: TICKET_STATUS_LABEL.PENDING_APPROVAL },
  { value: 'CLOSED', label: TICKET_STATUS_LABEL.CLOSED },
  { value: 'ON_HOLD', label: TICKET_STATUS_LABEL.ON_HOLD },
];

export const STATUS_CONFIG: Record<TicketStatus, { bg: string; text: string; border: string }> = {
  OPEN: { bg: 'bg-surface-hover', text: 'text-text-secondary', border: 'border-border' },
  IN_PROGRESS: { bg: 'bg-warning/10', text: 'text-warning', border: 'border-warning/20' },
  PENDING_APPROVAL: { bg: 'bg-status-approve/10', text: 'text-status-approve', border: 'border-status-approve/20' },
  CLOSED: { bg: 'bg-success/10', text: 'text-success', border: 'border-success/20' },
  ON_HOLD: { bg: 'bg-surface', text: 'text-text-muted', border: 'border-border' },
};

export const UPLOADS_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:5050';

/** Section heading inside the ticket sheet (Status history, Photos, Checklists): small, the same style as the form's field labels. */
export const DETAIL_SECTION_HEADING = 'flex items-center gap-2 t-meta font-display font-semibold text-text-secondary';

/** The gradient icon tile in front of a section heading, the same as Activity's. */
export const DETAIL_SECTION_TILE = 'flex size-6 shrink-0 items-center justify-center rounded-md text-white bg-linear-to-br from-primary-500 to-primary-600';
