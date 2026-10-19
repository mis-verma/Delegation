import type { LucideIcon } from 'lucide-react';
import { PRIORITY_CHIP_META } from '../../components/priorityChip';
import type { Ticket, TicketStatus } from '../../api/ticket';
import { TICKET_STATUS_LABEL } from '../../lib/ticketStatusLabel';

export const formatAge = (iso: string): string => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return 'Today';
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
};

export const ticketCode = (id: string) => `TICK-${id ? id.slice(0, 6).toUpperCase() : '------'}`;

export const formatShortDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
};

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

export const hoursUntil = (due: Date, now = Date.now()): number =>
  Math.max(1 / 60, Math.round(((due.getTime() - now) / 3_600_000) * 10_000) / 10_000);

const formatClockShort = (d: Date) => {
  const text = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return d.getMinutes() === 0 ? text.replace(/:00(?=\s?[APap]\.?[Mm])/, '') : text;
};

export const formatDueLabel = (
  ticket: Pick<Ticket, 'tatDueAt' | 'status' | 'isOverdue'>,
): { text: string; label: string; overdue: boolean; today: boolean } | null => {
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
  const today = !overdue && days === 0 && ticket.status !== 'CLOSED' && ticket.status !== 'PENDING_APPROVAL';
  return { text, label: text, overdue, today };
};
