import { CalendarClock, Megaphone, Radio } from 'lucide-react';
import { LayoutGrid, LayoutList, Table2 } from 'lucide-react';
import type { ViewTab } from '../../components';
import type { StatusFigureItem } from '../dashboard/StatusFigureStats';
import type { EventType } from '../../api/events';

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  DEADLINE: 'Deadline',
  ANNOUNCEMENT: 'Announcement',
  BROADCAST: 'Broadcast',
};

export const EVENT_TYPE_SOLID: Record<EventType, string> = {
  DEADLINE: 'bg-danger',
  ANNOUNCEMENT: 'bg-primary-600',
  BROADCAST: 'bg-warning',
};

export const EVENT_TYPE_ICONS: Record<EventType, typeof CalendarClock> = {
  DEADLINE: CalendarClock,
  ANNOUNCEMENT: Megaphone,
  BROADCAST: Radio,
};

export const EVENT_TYPE_GRADIENT: Record<EventType, string> = {
  DEADLINE: 'linear-gradient(135deg, var(--color-danger) 0%, color-mix(in srgb, var(--color-danger) 70%, black) 100%)',
  ANNOUNCEMENT: 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-primary-700) 100%)',
  BROADCAST: 'linear-gradient(135deg, var(--color-warning) 0%, color-mix(in srgb, var(--color-warning) 70%, black) 100%)',
};

export type EventStatus = 'upcoming' | 'today' | 'week' | 'past';
export type EventView = 'cards' | 'list' | 'table';
export type EventTypeFilter = EventType | 'ALL';

export interface EventClock {
  now: number;
  dayStart: number;
  dayEnd: number;
  weekStart: number;
  weekEnd: number;
}

export const buildEventClock = (nowMs: number): EventClock => {
  const day = new Date(nowMs);
  day.setHours(0, 0, 0, 0);
  const week = new Date(day);
  week.setDate(week.getDate() - week.getDay());
  const weekEnd = new Date(week);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const dayEnd = new Date(day);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return { now: nowMs, dayStart: day.getTime(), dayEnd: dayEnd.getTime(), weekStart: week.getTime(), weekEnd: weekEnd.getTime() };
};

export const EVENT_STATUS_MATCH: Record<EventStatus, (at: number, c: EventClock) => boolean> = {
  upcoming: (at, c) => at >= c.now,
  today: (at, c) => at >= c.dayStart && at < c.dayEnd,
  week: (at, c) => at >= c.weekStart && at < c.weekEnd,
  past: (at, c) => at < c.now,
};

export const EVENT_STATUS_KEYS = Object.keys(EVENT_STATUS_MATCH) as EventStatus[];

export const EVENT_STATUS_ITEMS: StatusFigureItem<EventStatus>[] = [
  { key: 'upcoming', kind: 'pending', label: 'Upcoming', short: 'Upcoming', help: 'Events that have not happened yet' },
  { key: 'today', kind: 'due', label: 'Today', short: 'Today', help: 'Events dated today' },
  { key: 'week', kind: 'total', label: 'This week', short: 'Week', help: 'Events dated Sunday to Saturday this week' },
  { key: 'past', kind: 'completed', label: 'Past', short: 'Past', help: 'Events that already happened' },
];

export const EVENT_STATUS_EMPTY: Record<EventStatus, string> = {
  upcoming: 'No upcoming events',
  today: 'No events today',
  week: 'No events this week',
  past: 'No past events',
};

export const EVENT_VIEW_KEYS: Record<EventView, true> = { cards: true, list: true, table: true };

export const EVENT_VIEW_TABS: ViewTab<EventView>[] = [
  { key: 'cards', label: 'Cards', icon: LayoutGrid },
  { key: 'list', label: 'List', icon: LayoutList },
  { key: 'table', label: 'Table', icon: Table2, mobileHidden: true },
];

export const EVENT_TYPE_FILTER_OPTIONS: { value: EventTypeFilter; label: string }[] = [
  { value: 'ALL', label: 'All types' },
  { value: 'DEADLINE', label: EVENT_TYPE_LABELS.DEADLINE },
  { value: 'ANNOUNCEMENT', label: EVENT_TYPE_LABELS.ANNOUNCEMENT },
  { value: 'BROADCAST', label: EVENT_TYPE_LABELS.BROADCAST },
];

export const whenLabel = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
