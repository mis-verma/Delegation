import { CheckSquare, TicketCheck, ClipboardCheck, type LucideIcon } from 'lucide-react';
import { ACTIVITY_CATEGORY_DOT_CLASS } from '../dashboard/dashboardDisplay';
import { EVENT_TYPE_ICONS, EVENT_TYPE_LABELS } from '../events/eventDisplay';
import type { EventType } from '../../api/events';

export type CalendarItemType = 'delegation' | 'ticket' | 'checklist' | EventType;

export interface CalendarItem {
  id: string;
  title: string;
  type: CalendarItemType;
  date: Date;
  completed: boolean;
  overdue: boolean;
  link: string;
}

export const CALENDAR_ITEM_LABEL: Record<CalendarItemType, string> = {
  delegation: 'Delegation',
  ticket: 'Ticket',
  checklist: 'Checklist',
  ...EVENT_TYPE_LABELS,
};

export const CALENDAR_ITEM_ICON: Record<CalendarItemType, LucideIcon> = {
  delegation: CheckSquare,
  ticket: TicketCheck,
  checklist: ClipboardCheck,
  ...EVENT_TYPE_ICONS,
};

export const CALENDAR_ITEM_DOT_CLASS: Record<CalendarItemType, string> = {
  delegation: ACTIVITY_CATEGORY_DOT_CLASS.delegation,
  ticket: ACTIVITY_CATEGORY_DOT_CLASS.ticket,
  checklist: ACTIVITY_CATEGORY_DOT_CLASS.checklist,
  DEADLINE: 'bg-danger',
  ANNOUNCEMENT: 'bg-coral-500',
  BROADCAST: 'bg-warning',
};

export const dayKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export const isSameCalendarDay = (a: Date, b: Date): boolean => dayKey(a) === dayKey(b);

export const buildMonthGrid = (year: number, month: number): Date[] => {
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
};

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type CalendarCreateKind = 'delegation' | 'ticket';

export const hasCalendarStatus = (type: CalendarItemType): boolean =>
  type === 'delegation' || type === 'ticket' || type === 'checklist';

export type CalendarItemState = 'completed' | 'overdue' | 'pending';

export const calendarItemState = (item: Pick<CalendarItem, 'completed' | 'overdue'>): CalendarItemState =>
  item.completed ? 'completed' : item.overdue ? 'overdue' : 'pending';

export const defaultDueFor = (day: Date, nowMs: number): Date | undefined => {
  const evening = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 18, 0, 0, 0);
  if (evening.getTime() > nowMs) return evening;
  const soon = new Date(nowMs + 60 * 60 * 1000);
  return isSameCalendarDay(soon, day) ? soon : undefined;
};

export const relativeDayLabel = (day: Date, today: Date): string => {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((start(day) - start(today)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return day.toLocaleDateString(undefined, { weekday: 'long' });
};
