import {
  TicketCheck, CheckSquare, ClipboardCheck, ShieldCheck, XCircle, AlarmClock, PauseCircle, Flag, Hourglass, Bell, MessageSquare, DoorOpen, CalendarClock, UserPlus, UserX, ArrowRightCircle, Siren, Ban, ShieldQuestion, Activity, Handshake,
  type LucideIcon,
} from 'lucide-react';
import type { Notification } from '@/api/notifications';

const OUTCOME: Array<{ match: string; icon: LucideIcon; tile: string }> = [
  { match: 'ESCALATION', icon: Siren, tile: 'bg-linear-to-br from-danger to-danger/70 text-white' },
  { match: 'RISK_CRITICAL', icon: Siren, tile: 'bg-linear-to-br from-danger to-danger/70 text-white' },
  { match: 'BACKUP_FAILED', icon: Siren, tile: 'bg-linear-to-br from-danger to-danger/70 text-white' },
  { match: 'DECLINED', icon: Ban, tile: 'bg-linear-to-br from-danger to-danger/70 text-white' },
  { match: 'AWAITING_HEAD_ESCALATION', icon: Siren, tile: 'bg-linear-to-br from-danger to-danger/70 text-white' },
  { match: 'TICKET_STALE', icon: Activity, tile: 'bg-linear-to-br from-warning to-warning/70 text-white' },
  { match: 'AWAITING_HEAD', icon: ShieldQuestion, tile: 'bg-linear-to-br from-warning to-warning/70 text-white' },
  { match: 'TICKET_PROGRESS', icon: Activity, tile: 'bg-linear-to-br from-warning to-warning/70 text-white' },
  { match: 'HOD_APPROVED', icon: ShieldCheck, tile: 'bg-linear-to-br from-primary-500 to-primary-600 text-white' },
  { match: 'DUE_SOON', icon: AlarmClock, tile: 'bg-linear-to-br from-warning to-warning/70 text-white' },
  { match: 'HANDED_OVER', icon: Handshake, tile: 'bg-linear-to-br from-primary-500 to-primary-600 text-white' },
  { match: 'COMMENT', icon: MessageSquare, tile: 'bg-linear-to-br from-info to-info/70 text-white' },
  { match: 'OPENED', icon: DoorOpen, tile: 'bg-linear-to-br from-success to-success/70 text-white' },
  { match: 'UPCOMING', icon: CalendarClock, tile: 'bg-linear-to-br from-primary-500 to-primary-600 text-white' },
  { match: 'REVIEWER_ADDED', icon: UserPlus, tile: 'bg-linear-to-br from-primary-500 to-primary-600 text-white' },
  { match: 'UNASSIGNED', icon: UserX, tile: 'bg-linear-to-br from-warning to-warning/70 text-white' },
  { match: '_STATUS', icon: ArrowRightCircle, tile: 'bg-linear-to-br from-info to-info/70 text-white' },
  { match: 'APPROVED', icon: ShieldCheck, tile: 'bg-linear-to-br from-success to-success/70 text-white' },
  { match: 'REJECTED', icon: XCircle, tile: 'bg-linear-to-br from-danger to-danger/70 text-white' },
  { match: 'OVERDUE', icon: AlarmClock, tile: 'bg-linear-to-br from-danger to-danger/70 text-white' },
  { match: 'FLAG', icon: Flag, tile: 'bg-linear-to-br from-danger to-danger/70 text-white' },
  { match: 'ON_HOLD', icon: PauseCircle, tile: 'bg-linear-to-br from-warning to-warning/70 text-white' },
  { match: 'PENDING_VERIFICATION', icon: Hourglass, tile: 'bg-linear-to-br from-warning to-warning/70 text-white' },
  { match: 'REMINDER', icon: AlarmClock, tile: 'bg-linear-to-br from-warning to-warning/70 text-white' },
];

const KIND: Array<{ match: string; icon: LucideIcon; tile: string; label: string }> = [
  { match: 'TICKET', icon: TicketCheck, tile: 'bg-linear-to-br from-primary-500 to-primary-600 text-white', label: 'Ticket' },
  { match: 'TASK', icon: CheckSquare, tile: 'bg-linear-to-br from-info to-info/70 text-white', label: 'Delegation' },
  { match: 'CHECKLIST', icon: ClipboardCheck, tile: 'bg-linear-to-br from-coral-500 to-coral-600 text-white', label: 'Checklist' },
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

export const notificationPath = (n: Pick<Notification, 'ticketId' | 'taskId' | 'checklistInstanceId'> & { type?: string }) => {
  if (n.type?.startsWith('SYSTEM_')) return '/admin/system-health';
  if (n.type === 'WORK_HANDED_OVER') return '/';
  if (n.ticketId) return `/tickets?open=${n.ticketId}`;
  if (n.taskId) return `/tasks?open=${n.taskId}`;
  if (n.checklistInstanceId) return `/checklists/${n.checklistInstanceId}`;
  if (n.type === 'CHECKLIST_REMINDER_NUDGE') return '/checklists';
  return null;
};

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

export type NotificationEntry =
  | { kind: 'single'; item: Notification }
  | { kind: 'cluster'; type: string; items: Notification[] };

const CLUSTER_MIN = 3;

export const clusterNotifications = (list: Notification[]): NotificationEntry[] => {
  const byType = new Map<string, Notification[]>();
  for (const n of list) byType.set(n.type, [...(byType.get(n.type) ?? []), n]);
  const placed = new Set<string>();
  const entries: NotificationEntry[] = [];
  for (const n of list) {
    const same = byType.get(n.type) ?? [n];
    if (same.length < CLUSTER_MIN) {
      entries.push({ kind: 'single', item: n });
      continue;
    }
    if (placed.has(n.type)) continue;
    placed.add(n.type);
    entries.push({ kind: 'cluster', type: n.type, items: same });
  }
  return entries;
};

export const clusterSubjects = (list: Notification[]): string[] =>
  list.map((n) => /"([^"]+)"/.exec(n.message)?.[1] ?? n.title);
