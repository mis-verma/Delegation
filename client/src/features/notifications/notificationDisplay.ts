import {
  TicketCheck, CheckSquare, ClipboardCheck, ShieldCheck, XCircle, AlarmClock, PauseCircle, Flag, Hourglass, Bell,
  type LucideIcon,
} from 'lucide-react';
import type { Notification } from '@/api/notifications';

// Type strings come from server/src/modules/notifications/notification.service.ts
// (e.g. TICKET_ASSIGNED, TASK_REJECTED, CHECKLIST_OVERDUE). The outcome suffix decides the colour
// (so "sent back" reads red wherever it came from); the prefix decides the icon when the outcome
// has none of its own.
const OUTCOME: Array<{ match: string; icon: LucideIcon; tile: string }> = [
  { match: 'APPROVED', icon: ShieldCheck, tile: 'bg-success/15 text-success' },
  { match: 'REJECTED', icon: XCircle, tile: 'bg-danger/15 text-danger' },
  { match: 'OVERDUE', icon: AlarmClock, tile: 'bg-danger/15 text-danger' },
  { match: 'FLAG', icon: Flag, tile: 'bg-danger/15 text-danger' },
  { match: 'ON_HOLD', icon: PauseCircle, tile: 'bg-warning/15 text-warning' },
  { match: 'PENDING_VERIFICATION', icon: Hourglass, tile: 'bg-warning/15 text-warning' },
  { match: 'REMINDER', icon: AlarmClock, tile: 'bg-warning/15 text-warning' },
];

const KIND: Array<{ match: string; icon: LucideIcon; tile: string; label: string }> = [
  { match: 'TICKET', icon: TicketCheck, tile: 'bg-primary-500/15 text-primary-700 dark:text-primary-300', label: 'Ticket' },
  { match: 'TASK', icon: CheckSquare, tile: 'bg-info/15 text-info', label: 'Delegation' },
  { match: 'CHECKLIST', icon: ClipboardCheck, tile: 'bg-coral-500/15 text-coral-700 dark:text-coral-300', label: 'Checklist' },
];

export const notificationLook = (type: string) => {
  const kind = KIND.find((k) => type.startsWith(k.match));
  const outcome = OUTCOME.find((o) => type.includes(o.match));
  return {
    icon: outcome?.icon ?? kind?.icon ?? Bell,
    tile: outcome?.tile ?? kind?.tile ?? 'bg-surface-hover text-text-muted',
    kindLabel: kind?.label ?? 'Update',
  };
};

export const notificationPath = (n: Pick<Notification, 'ticketId' | 'taskId' | 'checklistInstanceId' | 'checklistMissed'>) => {
  if (n.ticketId) return `/tickets?open=${n.ticketId}`;
  if (n.taskId) return `/tasks?open=${n.taskId}`;
  // A checklist whose day has ended is not opened from here: the person works today's checklist, and
  // this one only counts as missed.
  if (n.checklistInstanceId) return n.checklistMissed ? null : `/checklists/${n.checklistInstanceId}`;
  return null;
};

// "Today, 4:12 PM" / "Yesterday, 9:05 AM" / "26 Sep, 6:40 PM" (year only when it isn't this year).
export const formatNotificationTime = (iso: string) => {
  const date = new Date(iso);
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  const time = date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (date.toDateString() === now.toDateString()) return `Today, ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  const day = date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
  return `${day}, ${time}`;
};

export const formatRelativeShort = (iso: string) => {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

export interface NotificationGroup {
  label: 'Today' | 'Yesterday' | 'Earlier';
  items: Notification[];
}

// Newest first, bucketed by calendar day so a long list reads as "what happened today" before
// "what you missed". Empty buckets are left out. The list comes from the server newest-first already.
export const groupNotifications = (list: Notification[]): NotificationGroup[] => {
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  const buckets: NotificationGroup[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Earlier', items: [] },
  ];
  for (const n of list) {
    const day = new Date(n.createdAt).toDateString();
    const bucket = day === now.toDateString() ? buckets[0] : day === yesterday.toDateString() ? buckets[1] : buckets[2];
    bucket.items.push(n);
  }
  return buckets.filter((b) => b.items.length > 0);
};
