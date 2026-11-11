import type { Ticket } from '../../../api/ticket';
import { isClaimable } from '../claim/ticketClaim';

export type ScopeFilter = 'ALL' | 'CREATED_BY_ME' | 'ASSIGNED_TO_ME' | 'TO_CLAIM';

export const SCOPE_FILTERS: { key: ScopeFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'CREATED_BY_ME', label: 'Created by me' },
  { key: 'ASSIGNED_TO_ME', label: 'Assigned to me' },
  { key: 'TO_CLAIM', label: 'To claim' },
];

export const SCOPE_FILTER_PREDICATES: Record<ScopeFilter, (t: Ticket, userId: string) => boolean> = {
  ALL: () => true,
  CREATED_BY_ME: (t, userId) => t.userId === userId,
  ASSIGNED_TO_ME: (t, userId) => t.assigneeId === userId,
  TO_CLAIM: (t) => isClaimable(t),
};
