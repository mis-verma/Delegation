import { CheckSquare, TicketCheck, ClipboardCheck, type LucideIcon } from 'lucide-react';
import { ACTIVITY_CATEGORY_DOT_CLASS } from '../dashboard/dashboardDisplay';
import { EVENT_TYPE_ICONS, EVENT_TYPE_LABELS } from '../events/eventDisplay';
import type { EventType } from '../../api/events';

// Events aren't one bucket on the calendar — a Deadline, Announcement, and Broadcast are as
// different from each other as a Ticket is from a Delegation, so the type union folds `EventType`
// in directly instead of collapsing all three into one generic "event" dot the way the first pass
// did. Reusing `EventType`'s own member names (not translating them) means EVENT_TYPE_ICONS/LABELS
// from eventDisplay.ts — the app's one existing source of truth for what an event type looks like
// — can be spread straight into the maps below with no adapter layer.
export type CalendarItemType = 'delegation' | 'ticket' | 'checklist' | EventType;

export interface CalendarItem {
  id: string;
  title: string;
  type: CalendarItemType;
  /** The real due/deadline/event instant — used for the day-cell bucket and the day panel's time
   *  label. */
  date: Date;
  completed: boolean;
  overdue: boolean;
  /** Where clicking this item in the day panel sends the viewer. None of Tasks/Tickets/Events have
   *  a per-item detail route (they open via a list-page modal), so these link to the list page
   *  itself — only Checklist instances have a real `/checklists/:id` route. */
  link: string;
}

export const CALENDAR_ITEM_LABEL: Record<CalendarItemType, string> = {
  delegation: 'Delegation',
  ticket: 'Ticket',
  checklist: 'Checklist',
  ...EVENT_TYPE_LABELS,
};

// Reuses the sidebar's own nav icons for Delegation/Tickets/Checklists (CheckSquare/TicketCheck/
// ClipboardCheck) so an item on the calendar is recognizable from the same glyph a viewer already
// associates with that section, and eventDisplay.ts's own per-type icons (CalendarClock/Megaphone/
// Radio) for the three event kinds — one set of icon choices, not a parallel one invented here.
export const CALENDAR_ITEM_ICON: Record<CalendarItemType, LucideIcon> = {
  delegation: CheckSquare,
  ticket: TicketCheck,
  checklist: ClipboardCheck,
  ...EVENT_TYPE_ICONS,
};

// Delegation/Ticket/Checklist keep the Dashboard's one-navy-family category palette (same meaning
// everywhere in the app). Deadline and Broadcast reuse their own already-established colors from
// EVENT_TYPE_COLORS (rose, amber) for the same reason. Announcement is the one deliberate
// exception: its established color there is primary (navy) — identical to Delegation's dot — which
// reads fine standing alone but becomes ambiguous the moment both appear as dots on the same grid,
// exactly the clarity problem this calendar exists to avoid. It gets the gold accent instead
// (matching the single flat "Event" dot color the first pass used for every event, so this is a
// split, not an unrelated new color).
// `bg-danger`/`bg-warning`, not the raw `rose-500`/`amber-500` this used to read — those aren't in
// the project's palette (index.css defines `coral`, not `rose` or `amber`) and don't move with the
// app's light/dark tokens. See eventDisplay.ts's EVENT_TYPE_SOLID, which this now matches exactly.
export const CALENDAR_ITEM_DOT_CLASS: Record<CalendarItemType, string> = {
  delegation: ACTIVITY_CATEGORY_DOT_CLASS.delegation,
  ticket: ACTIVITY_CATEGORY_DOT_CLASS.ticket,
  checklist: ACTIVITY_CATEGORY_DOT_CLASS.checklist,
  DEADLINE: 'bg-danger',
  ANNOUNCEMENT: 'bg-coral-500',
  BROADCAST: 'bg-warning',
};

// Icon-tile tint for the legend chips and the day panel's per-row icon — a soft background plus a
// matching icon color, same "bg-X/10 text-X" shape every tinted icon tile in the app already uses.
export const CALENDAR_ITEM_TINT_CLASS: Record<CalendarItemType, string> = {
  delegation: 'bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400',
  ticket: 'bg-primary-100 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300',
  checklist: 'bg-primary-200/70 dark:bg-primary-500/20 text-primary-900 dark:text-primary-200',
  DEADLINE: 'bg-danger/10 text-danger',
  ANNOUNCEMENT: 'bg-coral-50 dark:bg-coral-500/10 text-coral-600 dark:text-coral-400',
  BROADCAST: 'bg-warning/10 text-warning',
};

/** Calendar-day identity in the viewer's own local time — every item type resolves to a real
 *  timestamp instant one way or another (task/ticket/event dates are already instants; a checklist
 *  instance's deadline is computed to one by `instanceDeadline`), so bucketing by local
 *  year/month/day is correct and consistent for all four, unlike checklistDisplay's UTC-pinned
 *  formatting helpers (which exist to render a calendar-day-only field as text without a timezone
 *  shift — a different problem from "which grid cell does this instant fall into for this viewer"). */
export const dayKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export const isSameCalendarDay = (a: Date, b: Date): boolean => dayKey(a) === dayKey(b);

/** A fixed 6-week (42-day) grid starting on the Sunday on/before the 1st of `month` — always long
 *  enough to cover any month regardless of its length or which weekday it starts on, so the grid
 *  never needs to resize between months. */
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
