import type { Ticket, TicketStatus } from '../../api/ticket';
import type { Task } from '../../api/task';
import { PANEL_CLASS } from '../../components/entityCard';
import type { DrilldownRow } from './DrilldownModal';
import { isTaskHandedIn } from '../../lib/handedIn';
import { GOOD_FROM, FAIR_FROM } from '../../lib/scoreBands';

export const DASHBOARD_CARD_CLASS = `${PANEL_CLASS} h-full`;

export const formatRelativeTime = (isoDate: string) => {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const SHORT_DATE = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const shortDate = (isoDate: string) => SHORT_DATE.format(new Date(isoDate)).replace(',', '');

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const calendarDaysBetween = (from: number, to: number) => Math.round((startOfDay(new Date(to)) - startOfDay(new Date(from))) / 86_400_000);

const pastDayLabel = (isoDate: string, now: number): string => {
  const at = new Date(isoDate).getTime();
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const days = calendarDaysBetween(at, now);
  if (days === 0) {
    const hours = Math.floor(minutes / 60);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }
  if (days === 1) return 'Yesterday';
  return shortDate(isoDate);
};

export const waitingFor = (isoDate: string, now: number): string => {
  const hours = Math.floor((now - new Date(isoDate).getTime()) / 3_600_000);
  if (hours < 1) return 'under an hour';
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
};

const CARD_TILE_BASE = 'hidden sm:flex size-9 shrink-0 items-center justify-center rounded-lg text-white';
const CARD_TILE_TONE = {
  primary: 'bg-linear-to-br from-primary-500 to-primary-600',
  danger: 'bg-linear-to-br from-danger to-danger/70',
  info: 'bg-linear-to-br from-primary-500 to-primary-600',
  coral: 'bg-linear-to-br from-primary-500 to-primary-600',
  success: 'bg-linear-to-br from-primary-500 to-primary-600',
  warning: 'bg-linear-to-br from-primary-500 to-primary-600',
} as const;
export const cardIconTile = (tone: keyof typeof CARD_TILE_TONE = 'primary') => `${CARD_TILE_BASE} ${CARD_TILE_TONE[tone]}`;

export const greeting = (at: Date) => {
  const hour = at.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

export type FeedItem =
  | { kind: 'ticket'; id: string; title: string; status: TicketStatus; createdAt: string }
  | { kind: 'task'; id: string; title: string; status: Task['status']; createdAt: string };

export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type Trend = { direction: 'up' | 'down'; label: string };

export const trendFrom = (current: number, previous: number): Trend => {
  if (previous === 0) {
    return { 
      direction: current > 0 ? 'up' : 'down', 
      label: current > 0 ? 'New' : '0%' 
    };
  }
  
  const pct = ((current - previous) / previous) * 100;
  return { 
    direction: pct >= 0 ? 'up' : 'down', 
    label: `${pct >= 0 ? '+' : ''}${Math.round(pct)}%`
  };
};

export const isTaskOverdue = (task: Pick<Task, 'status' | 'dueDate' | 'awaitingHeadApproval'>, now: number): boolean => {
  if (task.awaitingHeadApproval) return false;
  if (task.status === 'done' || task.status === 'draft' || task.status === 'pending_approval') return false;
  if (!task.dueDate) return false;
  return new Date(task.dueDate).getTime() < now;
};

const clockLabel = (d: Date): string => {
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h % 12 === 0 ? 12 : h % 12}${m ? `:${pad2(m)}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
};
const dayMonth = (d: Date): string => `${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`;

export const dueLabel = (isoDate: string, now: number, late: boolean): string => {
  const due = new Date(isoDate);
  const days = calendarDaysBetween(now, due.getTime());
  if (late) {
    if (days === 0) return `Late since ${clockLabel(due)}`;
    return days === -1 ? 'Late since yesterday' : `Late since ${dayMonth(due)}`;
  }
  if (days === 0) return `Due today, ${clockLabel(due)}`;
  if (days === 1) return `Due tomorrow, ${clockLabel(due)}`;
  return `Due ${dayMonth(due)}, ${clockLabel(due)}`;
};

export const doneLabel = (isoDate: string, now: number): string => {
  const when = pastDayLabel(isoDate, now);
  return `Done ${when === 'Yesterday' || when === 'Just now' ? when.toLowerCase() : when}`;
};

export const taskDrilldownRow = (task: Task, now: number): DrilldownRow => {
  const completed = isTaskHandedIn(task);
  const overdue = isTaskOverdue(task, now);
  const meta = task.status === 'pending_approval'
    ? 'Handed in, waiting for approval'
    : completed
      ? doneLabel(task.verifiedAt ?? task.updatedAt, now)
      : task.dueDate
        ? dueLabel(task.dueDate, now, overdue)
        : 'No due date';
  return {
    id: task.id,
    title: task.title,
    link: `/tasks?open=${task.id}`,
    createdAt: task.createdAt,
    completed,
    overdue,
    meta,
    dueAt: task.dueDate ? new Date(task.dueDate).getTime() : null,
  };
};

export const isTicketLate = (ticket: Pick<Ticket, 'status' | 'isOverdue' | 'closedAt' | 'tatDueAt'>): boolean => {
  if (ticket.status === 'CLOSED') {
    if (!ticket.closedAt || !ticket.tatDueAt) return false;
    return new Date(ticket.closedAt).getTime() > new Date(ticket.tatDueAt).getTime();
  }
  return ticket.isOverdue;
};

export type CompliancePeriod = 'day' | 'week' | 'month' | 'year';

const pad2 = (n: number) => String(n).padStart(2, '0');

const isoWeek = (d: Date) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const isoYear = date.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const week = 1 + Math.round(((date.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return { isoYear, week };
};

export const bucketKeyFor = (period: CompliancePeriod, date: Date): string => {
  switch (period) {
    case 'day': return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    case 'week': { const { isoYear, week } = isoWeek(date); return `${isoYear}-W${pad2(week)}`; }
    case 'month': return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
    case 'year': return String(date.getFullYear());
  }
};

export type ActivityGroupBy = 'day' | 'month' | 'quarter' | 'year';

export interface ActivityBucket {
  label: string;
  start: Date;
  end: Date;
}

export type ActivityCategory = 'checklist' | 'todo' | 'ticket' | 'delegation';
export const ACTIVITY_CATEGORY_LABEL: Record<ActivityCategory, string> = {
  checklist: 'Checklist',
  todo: 'To-do',
  ticket: 'Ticket',
  delegation: 'Delegation',
};
export const ACTIVITY_CATEGORY_DOT_CLASS: Record<ActivityCategory, string> = {
  checklist: 'bg-activity-checklist',
  ticket: 'bg-activity-ticket',
  delegation: 'bg-activity-delegation',
  todo: 'bg-activity-todo',
};

export interface ActivityWorkItem {
  id: string;
  title: string;
  link: string;
  category: ActivityCategory;
  createdAt: string;
  completed: boolean;
  overdue: boolean;
  late?: boolean;
  userIds: string[];
  departmentId: string | null;
  storeId: string | null;
}

export type RateTone = 'success' | 'warning' | 'danger' | 'neutral';

const RATE_VOLUME_FLOOR = 5;

export const rateTone = (percent: number, total: number): RateTone => {
  if (total < RATE_VOLUME_FLOOR) return 'neutral';
  if (percent >= GOOD_FROM) return 'success';
  if (percent >= FAIR_FROM) return 'warning';
  return 'danger';
};