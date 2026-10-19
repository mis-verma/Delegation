import type { TicketStatus, RestrictedStatus } from '../../../api/ticket';
import { TICKET_STATUS_LABEL } from '../../../lib/ticketStatusLabel';

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

export const UPLOADS_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:5050';

export const DETAIL_SECTION_HEADING = 'flex items-center gap-2 t-meta font-display font-semibold text-text-secondary';

export const DETAIL_SECTION_TILE = 'flex size-6 shrink-0 items-center justify-center rounded-md text-white bg-linear-to-br from-primary-500 to-primary-600';
