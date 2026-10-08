import { ArrowDown, Minus, ArrowUp, AlertTriangle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Ticket, TicketStatus } from '../../api/ticket';

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
    label: 'Open',
    className: 'bg-surface-hover text-text-secondary ring-border',
    dot: 'bg-text-muted',
  },
  IN_PROGRESS: {
    label: 'In Progress',
    className: 'bg-warning/10 text-warning ring-warning/20',
    dot: 'bg-warning',
  },
  // Same status-approve token Task's pending_approval uses, so the review stage reads
  // consistently across entities.
  PENDING_APPROVAL: {
    label: 'Pending Approval',
    className: 'bg-status-approve/10 text-status-approve ring-status-approve/20',
    dot: 'bg-status-approve',
  },
  CLOSED: {
    label: 'Closed',
    className: 'bg-success/10 text-success ring-success/20',
    dot: 'bg-success',
  },
  ON_HOLD: {
    label: 'On Hold',
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
    label: 'Low',
    className: 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border/50 bg-surface-hover/30 px-2.5 py-0.5 text-xs font-medium text-text-muted transition-all',
    accent: 'bg-text-muted',
    stripe: 'bg-border',
    bar: 'bg-info',
    solid: 'bg-text-light',
    icon: ArrowDown,
  },
  MEDIUM: {
    label: 'Medium',
    className: 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 text-xs font-semibold text-warning-700 dark:text-warning shadow-sm transition-all',
    accent: 'bg-warning',
    stripe: 'bg-warning/50',
    bar: 'bg-warning',
    solid: 'bg-warning',
    icon: Minus,
  },
  HIGH: {
    label: 'High',
    className: 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-danger/30 bg-danger/10 px-2.5 py-0.5 text-xs font-semibold text-danger-700 dark:text-danger shadow-sm transition-all',
    accent: 'bg-danger',
    stripe: 'bg-danger/50',
    bar: 'bg-danger',
    solid: 'bg-danger',
    icon: ArrowUp,
  },
  CRITICAL: {
    label: 'Critical',
    className: 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-transparent bg-danger px-2.5 py-0.5 text-xs font-bold text-white shadow-md shadow-danger/20 transition-all',
    accent: 'bg-white',
    stripe: 'bg-danger/80',
    bar: 'bg-danger',
    solid: 'bg-danger',
    icon: AlertTriangle,
  },
};

/**
 * The one wording for a ticket's target date, shared by the card, table and timeline so they agree:
 * "Today" / "Tomorrow" / "Yesterday", otherwise "5 Oct". `label` adds a "Delayed" prefix when the
 * ticket is overdue and not closed. Null when the ticket has no target date.
 */
export const formatDueLabel = (
  ticket: Pick<Ticket, 'tatDueAt' | 'status' | 'isOverdue'>,
): { text: string; label: string; overdue: boolean } | null => {
  if (!ticket.tatDueAt) return null;
  const startOfDay = (d: Date) => new Date(d).setHours(0, 0, 0, 0);
  const due = new Date(ticket.tatDueAt);
  const days = Math.round((startOfDay(due) - startOfDay(new Date())) / 86_400_000);
  const text =
    days === 0 ? 'Today'
    : days === 1 ? 'Tomorrow'
    : days === -1 ? 'Yesterday'
    : due.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const overdue = ticket.isOverdue && ticket.status !== 'CLOSED';
  return { text, label: overdue ? `Delayed · ${text}` : text, overdue };
};
