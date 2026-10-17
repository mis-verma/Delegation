

export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Trigger look for the routing grid's pickers (category, department, priority, due date): a full
 *  width field, 44px tall on phones and 40px from sm up, so every one is an easy thumb target. */
export const FIELD_TRIGGER_CLASS =
  'h-11 sm:h-10 px-3 rounded-lg border-border/60 bg-surface hover:border-primary-400 text-sm';
