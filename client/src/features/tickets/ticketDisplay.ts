import type { LucideIcon } from 'lucide-react';
import { PRIORITY_CHIP_META } from '../../components/priorityChip';
import type { Ticket, TicketStatus } from '../../api/ticket';
import { TICKET_STATUS_LABEL } from '../../lib/ticketStatusLabel';

/** How long ago, in the smallest useful unit: "Today", "3d", "2w", "5mo". For the card's quiet age mark. */
export const formatAge = (iso: string): string => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return 'Today';
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
};

export const formatShortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Short human reference for a ticket ("TICK-YBHT1A"), shown on cards and the detail header. */
export const ticketCode = (id: string) => `TICK-${id ? id.slice(0, 6).toUpperCase() : '------'}`;

export const formatShortDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
};

// `className` here is only for RecentActivity.tsx's own glow-dot activity pill (a more
// specialized treatment than the shared StatusChip) — every plain status chip render should use
// <StatusChip status={...} /> from components/statusChip instead of this className.
export const STATUS_CONFIG: Record<TicketStatus, { label: string; className: string; dot: string }> = {
  OPEN: {
    label: TICKET_STATUS_LABEL.OPEN,
    className: 'bg-surface-hover text-text-secondary ring-border',
    dot: 'bg-text-muted',
  },
  IN_PROGRESS: {
    label: TICKET_STATUS_LABEL.IN_PROGRESS,
    className: 'bg-warning/10 text-warning ring-warning/20',
    dot: 'bg-warning',
  },
  // Same status-approve token Task's pending_approval uses, so the review stage reads
  // consistently across entities.
  PENDING_APPROVAL: {
    label: TICKET_STATUS_LABEL.PENDING_APPROVAL,
    className: 'bg-status-approve/10 text-status-approve ring-status-approve/20',
    dot: 'bg-status-approve',
  },
  CLOSED: {
    label: TICKET_STATUS_LABEL.CLOSED,
    className: 'bg-success/10 text-success ring-success/20',
    dot: 'bg-success',
  },
  ON_HOLD: {
    label: TICKET_STATUS_LABEL.ON_HOLD,
    className: 'bg-surface-hover text-text-muted ring-border',
    dot: 'bg-border',
  },
};

// `bar` is priority at full strength for a shape that IS the data rather than an accent on it —
// the Timeline view's Gantt bars — same convention as Task's PRIORITY_MAP.bar. `solid`/`icon` feed
// PriorityChip's icon circle (see IconChip) — a dedicated field rather than reusing `accent`,
// since CRITICAL's `accent` is `bg-white` (meant for a dot sitting on its own solid-danger badge
// background), which would be an invisible white-on-white icon circle.
export const PRIORITY_CONFIG: Record<Ticket['priority'], { label: string; className: string; accent: string; stripe: string; bar: string; solid: string; icon: LucideIcon }> = {
  LOW: {
    ...PRIORITY_CHIP_META.low,
    className: 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border/50 bg-surface-hover/30 px-2.5 py-0.5 text-xs font-medium text-text-muted transition-all',
    accent: 'bg-text-muted',
    stripe: 'bg-border',
    bar: 'bg-info',
  },
  MEDIUM: {
    ...PRIORITY_CHIP_META.medium,
    className: 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 text-xs font-semibold text-warning-700 dark:text-warning shadow-sm transition-all',
    accent: 'bg-warning',
    stripe: 'bg-warning/50',
    bar: 'bg-warning',
  },
  HIGH: {
    ...PRIORITY_CHIP_META.high,
    className: 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-danger/30 bg-danger/10 px-2.5 py-0.5 text-xs font-semibold text-danger-700 dark:text-danger shadow-sm transition-all',
    accent: 'bg-danger',
    stripe: 'bg-danger/50',
    bar: 'bg-danger',
  },
  CRITICAL: {
    ...PRIORITY_CHIP_META.critical,
    className: 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-transparent bg-danger px-2.5 py-0.5 text-xs font-bold text-white shadow-md shadow-danger/20 transition-all',
    accent: 'bg-white',
    stripe: 'bg-danger/80',
    bar: 'bg-danger',
  },
};

/**
 * A picked due moment as the server's `tatHours` (it only takes "hours from now"). Kept as a
 * fraction, not rounded up to whole hours, so a ticket due at 6:00 PM is due at 6:00 PM and not up
 * to 6:59. Floored at one minute because the server needs a positive number; the forms already
 * refuse a time in the past.
 */
export const hoursUntil = (due: Date, now = Date.now()): number =>
  Math.max(1 / 60, Math.round(((due.getTime() - now) / 3_600_000) * 10_000) / 10_000);

/** "6 PM" on the hour, "6:30 PM" otherwise. */
export const formatClockShort = (d: Date) => {
  const text = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  // "6:00 PM" -> "6 PM" on a 12-hour clock; a 24-hour clock keeps "18:00" (hour alone read as "18").
  return d.getMinutes() === 0 ? text.replace(/:00(?=\s?[APap]\.?[Mm])/, '') : text;
};

/**
 * The one wording for a ticket's due time, shared by the card, table, timeline and detail sheet so
 * they agree: "Due today, 6 PM", "Due tomorrow, 6 PM", "Due 12 Oct, 6 PM", and once it has passed
 * on an open ticket "Late since 10 Oct" ("Late since 4 PM" the same day). `text` and `label` are
 * the same string; both stay so older callers keep working. Null when the ticket has no due time.
 */
export const formatDueLabel = (
  ticket: Pick<Ticket, 'tatDueAt' | 'status' | 'isOverdue'>,
): { text: string; label: string; overdue: boolean } | null => {
  if (!ticket.tatDueAt) return null;
  const startOfDay = (d: Date) => new Date(d).setHours(0, 0, 0, 0);
  const due = new Date(ticket.tatDueAt);
  if (isNaN(due.getTime())) return null;
  const days = Math.round((startOfDay(due) - startOfDay(new Date())) / 86_400_000);
  const day = due.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const overdue = ticket.isOverdue && ticket.status !== 'CLOSED';
  const text = overdue
    ? `Late since ${days === 0 ? formatClockShort(due) : day}`
    : `Due ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : day}, ${formatClockShort(due)}`;
  return { text, label: text, overdue };
};
