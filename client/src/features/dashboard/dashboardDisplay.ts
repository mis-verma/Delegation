import type { Ticket, TicketStatus } from '../../api/ticket';
import type { Task } from '../../api/task';
import type { Todo } from '../../api/todos';
import type { ChecklistInstance } from '../../api/checklistInstances';
import { instanceDeadline } from '../checklist/checklistDisplay';
import { formatPoints } from '../admin/analytics/analyticsDisplay';
import { PANEL_CLASS } from '../../components/entityCard';
import type { DrilldownRow } from './DrilldownModal';

// The shared surface every Dashboard card sits on — one definition instead of the same substring
// retyped in eight different files, so a future change to the card's own look (like the richer
// icon-tile pass this landed alongside) only has one place to start from. Each card appends its
// own padding/flex/hover suffix on top of this, since those genuinely vary card to card.
//
// h-full: the grid these sit in stretches every row to its tallest card (see HomePage's grid
// comment) — without this, a card's own border/background stayed at its natural content height
// while the grid cell around it silently grew, so two cards sharing a row could still end at
// different lines. Harmless on a card that isn't in that grid (nothing else reads a shared class
// as "must fill its parent" unless the parent actually gives it a height to fill).
// Built on PANEL_CLASS so every dashboard card shares one radius, border and surface with the rest
// of the app (no dashboard-only dark-mode border override).
export const DASHBOARD_CARD_CLASS = `${PANEL_CLASS} h-full`;

// Mirrors taskDisplay.tsx's STATUS_CONFIG badge classes exactly — the feed sits on the same
// dashboard as the KPI modal that already uses those tokens, so the same task's status color
// shouldn't disagree depending on which widget is showing it.
export const TASK_STATUS_COLORS: Record<Task['status'], string> = {
  draft: 'bg-surface-hover text-text-muted',
  todo: 'bg-status-todo/10 text-status-todo',
  in_progress: 'bg-status-progress/10 text-status-progress',
  pending_approval: 'bg-status-approve/10 text-status-approve',
  done: 'bg-status-done/10 text-status-done',
  on_hold: 'bg-warning/10 text-warning',
};

// Humanized recency for feed timestamps — "2h ago" reads as more alive/scannable than a bare
// date, and falls back to a short absolute date once the item is old enough that "14d ago" stops
// being a meaningful unit of time.
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

// One short date for every dashboard list ("Mon 12 Oct"), so Recently created and Upcoming events
// never show the same day two different ways side by side.
const SHORT_DATE = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const shortDate = (isoDate: string) => SHORT_DATE.format(new Date(isoDate)).replace(',', '');

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const calendarDaysBetween = (from: number, to: number) => Math.round((startOfDay(new Date(to)) - startOfDay(new Date(from))) / 86_400_000);

// "Today" / "Tomorrow" / "Mon 12 Oct" for an upcoming date, so a list of deadlines reads as
// days away rather than a column of bare calendar dates. Compares local calendar days, not 24h
// spans, so 11pm tonight and 1am tomorrow land on different labels.
export const relativeDayLabel = (isoDate: string, now: number): string => {
  const days = calendarDaysBetween(now, new Date(isoDate).getTime());
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return shortDate(isoDate);
};

// The past-tense twin of relativeDayLabel for the dashboard feed: "Just now", "12 min ago",
// "3 hours ago", then "Yesterday" and the same "Mon 12 Oct" date the events list uses.
export const pastDayLabel = (isoDate: string, now: number): string => {
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

// How long something has sat in a queue, in whole units: "under an hour", "5 hours", "3 days".
// Unlike a relative time ("Yesterday"), it reads naturally after "Waiting".
export const waitingFor = (isoDate: string, now: number): string => {
  const hours = Math.floor((now - new Date(isoDate).getTime()) / 3_600_000);
  if (hours < 1) return 'under an hour';
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
};

// The one header tile every dashboard card uses: same size, radius and soft tint, so no card's
// header reads heavier than its neighbour's. Hidden on a phone, where the title needs the width.
const CARD_TILE_BASE = 'hidden sm:flex size-9 shrink-0 items-center justify-center rounded-lg text-white';
/** Each dashboard section has its own colour, so the page reads as sections and not as one blue wall. */
export const CARD_TILE_TONE = {
  primary: 'bg-linear-to-br from-primary-500 to-primary-600',
  danger: 'bg-linear-to-br from-danger to-danger/70',
  info: 'bg-linear-to-br from-info to-info/70',
  coral: 'bg-linear-to-br from-coral-500 to-coral-600',
  success: 'bg-linear-to-br from-success to-success/70',
} as const;
export const cardIconTile = (tone: keyof typeof CARD_TILE_TONE = 'primary') => `${CARD_TILE_BASE} ${CARD_TILE_TONE[tone]}`;
export const CARD_ICON_TILE_CLASS = cardIconTile();

// Takes the time as an argument on purpose. Called with no argument it read the clock inside, so the
// compiler saw a call with no inputs and computed it once per mount: the header kept saying "Good
// morning" all afternoon until the page was reloaded. Pass in a time that is kept up to date (the
// headers keep one in state, refreshed every 30 seconds) and it re-runs as the day moves on.
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

// Last `count` calendar months ending with the current one, oldest first.
export const lastMonths = (count: number) => {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1);
    return { year: d.getFullYear(), month: d.getMonth(), label: MONTH_LABELS[d.getMonth()] };
  });
};

// `isSameMonth`/`countInMonth`/`seriesInMonths` used to sit here — a per-month bucketing chain
// whose only stated purpose was feeding StatCard's `sparkline` prop, which was declared but never
// rendered. Nothing imported any of the three, so they went out with the prop.

export type Trend = { direction: 'up' | 'down'; label: string };

// Percent change from `previous` to `current`, expressed as a stat-card trend badge.
// No history to compare against yet (previous === 0) reads as flat, not a fabricated spike.
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

// Difference between two already-percentage values (e.g. two months' completion rates) as a plain
// point delta, not a percent-of-a-percent: "76% vs 72%" is +4 points, not +5.6%. Callers pass null
// for "no data" (a period with zero items has no rate, which is not the same as 0%); either side
// null gives null so no fake delta is shown. Returned unrounded; formatDelta rounds for display.
export const pointDelta = (current: number | null, previous: number | null): number | null => {
  if (current == null || previous == null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  return current - previous;
};

// '+4 pts' / '-3 pts' / '' (nothing to show). A delta that rounds to zero reads '0 pts' so a
// genuinely flat score is not mistaken for missing data.
export const formatDelta = (delta: number | null): string => (delta == null ? '' : formatPoints(delta));

// Open delegation that has passed its due date. Draft, pending-approval and done work never counts
// as overdue (the assignee has handed it off or it is not live yet), and no due date means no deadline.
export const isTaskOverdue = (task: Pick<Task, 'status' | 'dueDate'>, now: number): boolean => {
  if (task.status === 'done' || task.status === 'draft' || task.status === 'pending_approval') return false;
  if (!task.dueDate) return false;
  return new Date(task.dueDate).getTime() < now;
};

// "6 PM" on the hour, "6:30 PM" otherwise, in the viewer's own time.
const clockLabel = (d: Date): string => {
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h % 12 === 0 ? 12 : h % 12}${m ? `:${pad2(m)}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
};
const dayMonth = (d: Date): string => `${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`;

/**
 * When something is due, in words a pending list can show instead of how long ago it was created:
 * "Due today, 6 PM", "Due tomorrow, 9:30 AM", "Due 14 Oct, 6 PM", and once it has passed "Late since 10 Oct".
 * `late` is the caller's own rule (a ticket's TAT, a delegation's due date), so this never second-guesses it.
 */
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

/** "Done 3 hours ago", "Done yesterday", "Done Mon 12 Oct": for a finished row in a preview list. */
export const doneLabel = (isoDate: string, now: number): string => {
  const when = pastDayLabel(isoDate, now);
  return `Done ${when === 'Yesterday' || when === 'Just now' ? when.toLowerCase() : when}`;
};

// A delegation as a preview-modal row: one mapping for every dashboard card that opens a list of
// tasks, so the status and overdue flag can never disagree between two cards.
export const taskDrilldownRow = (task: Task, now: number): DrilldownRow => {
  const completed = task.status === 'done';
  const overdue = isTaskOverdue(task, now);
  const meta = completed
    ? doneLabel(task.verifiedAt ?? task.updatedAt, now)
    : task.status === 'pending_approval'
      ? 'Handed in, waiting for approval'
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

// "Late" for a ticket: still open and past its TAT (the server's isOverdue), or closed after its
// TAT due time. Same definition the ticket reports use, so a dashboard chip matches the report.
export const isTicketLate = (ticket: Pick<Ticket, 'status' | 'isOverdue' | 'closedAt' | 'tatDueAt'>): boolean => {
  if (ticket.status === 'CLOSED') {
    if (!ticket.closedAt || !ticket.tatDueAt) return false;
    return new Date(ticket.closedAt).getTime() > new Date(ticket.tatDueAt).getTime();
  }
  return ticket.isOverdue;
};

// Granularities the server's compliance-report aggregation already buckets by (see
// server/src/utils/dateBucket.ts) — "quarter" isn't one of them, since Mongo's $dateToString
// can't express a quarter directly, so it isn't offered here either.
export type CompliancePeriod = 'day' | 'week' | 'month' | 'year';

export const PERIOD_LABEL: Record<CompliancePeriod, string> = {
  day: 'today',
  week: 'this week',
  month: 'this month',
  year: 'this year',
};

export const PERIOD_END_LABEL: Record<CompliancePeriod, string> = {
  day: 'end of day',
  week: 'end of week',
  month: 'end of month',
  year: 'end of year',
};

// Single source for every CompliancePeriod tab row (CompareDashboard, MonthlyTargetCard) so both
// widgets' Day/Week/Month/Year controls stay in the same order with the same labels.
export const COMPLIANCE_PERIOD_OPTIONS: CompliancePeriod[] = ['day', 'week', 'month', 'year'];

export const PERIOD_TAB_LABEL: Record<CompliancePeriod, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  year: 'Year',
};

const pad2 = (n: number) => String(n).padStart(2, '0');

// ISO 8601 week-year + week-number (Thursday of the week decides the week-year) — matches the
// same convention Mongo's `%G-%V` format uses server-side, so a client-computed "week" bucket
// key lines up exactly with the server-aggregated one instead of drifting near year boundaries.
const isoWeek = (d: Date) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // nearest Thursday
  const isoYear = date.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const week = 1 + Math.round(((date.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return { isoYear, week };
};

// Builds the exact same bucket key string the server's $dateToString grouping produces for
// this granularity, so a client-computed "current period" lookup actually finds its row.
// Relies on an unenforced assumption: the server's MySQL pool has no `timezone` option set, so
// mysql2 stores/reads Date columns in the DB *host's* local OS timezone, and DATE_FORMAT()
// buckets on that same local value with no shift applied. This only lines up with the local
// getters used below because every deployment so far runs the app host and its viewers in the
// same zone (IST, matching env.CHECKLIST_TIMEZONE_OFFSET_MINUTES' default of 330) — a host moved
// to a different OS timezone would silently desync "current period" lookups near local midnight.
export const bucketKeyFor = (period: CompliancePeriod, date: Date): string => {
  switch (period) {
    case 'day': return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    case 'week': { const { isoYear, week } = isoWeek(date); return `${isoYear}-W${pad2(week)}`; }
    case 'month': return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
    case 'year': return String(date.getFullYear());
  }
};

// Start of the current period (local time) — e.g. midnight today, the Monday of this week, the
// 1st of this month/year. Used to filter a plain list of records (not server-bucketed) down to
// "just this period" client-side.
export const periodStartDate = (period: CompliancePeriod, date: Date): Date => {
  const d = new Date(date);
  if (period === 'day') { d.setHours(0, 0, 0, 0); return d; }
  if (period === 'week') {
    const dayIndex = (d.getDay() + 6) % 7; // Mon=0 .. Sun=6
    d.setDate(d.getDate() - dayIndex);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
  return new Date(d.getFullYear(), 0, 1);
};

// One period-length step back (or forward, with a negative amount) — used to find "the
// previous period" for a trend comparison, at whatever granularity is currently selected.
export const shiftPeriod = (period: CompliancePeriod, date: Date, amount: number): Date => {
  const d = new Date(date);
  if (period === 'day') d.setDate(d.getDate() + amount);
  else if (period === 'week') d.setDate(d.getDate() + amount * 7);
  else if (period === 'month') d.setMonth(d.getMonth() + amount);
  else d.setFullYear(d.getFullYear() + amount);
  return d;
};

// The Activity Overview chart buckets a plain client-side array (already-fetched tasks/tickets/
// todos), never a server aggregation — unlike CompliancePeriod above, there's no `$dateToString`
// constraint to respect here, so "quarter" is fine to offer as its own separate type rather than
// widening CompliancePeriod (which PersonChecklistView.tsx matches against real server buckets,
// and the server genuinely can't produce a quarter bucket).
export type ActivityGroupBy = 'day' | 'month' | 'quarter' | 'year';

export const ACTIVITY_GROUP_LABEL: Record<ActivityGroupBy, string> = {
  day: 'Day', month: 'Month', quarter: 'Quarter', year: 'Year',
};

export const ACTIVITY_GROUP_PERIOD_LABEL: Record<ActivityGroupBy, string> = {
  day: 'today', month: 'this month', quarter: 'this quarter', year: 'this year',
};

// How many trailing buckets the trend chart shows per granularity — e.g. the last 7 days, or the
// last 4 quarters (a full year), rather than one fixed count regardless of grain.
export const ACTIVITY_BUCKET_COUNT: Record<ActivityGroupBy, number> = {
  day: 7, month: 6, quarter: 4, year: 4,
};

// Describes the same trailing window ACTIVITY_BUCKET_COUNT covers — used by the Compliance gauges,
// which scope to that whole window (see ActivityComplianceGauges) rather than only the single
// current bucket, so the label under "Compliance" needs to say "last 6 months", not "this month".
export const ACTIVITY_GROUP_RANGE_LABEL: Record<ActivityGroupBy, string> = {
  day: 'last 7 days', month: 'last 6 months', quarter: 'last 4 quarters', year: 'last 4 years',
};

export interface ActivityBucket {
  label: string;
  start: Date;
  end: Date;
}

const quarterStart = (year: number, quarter: number) => new Date(year, quarter * 3, 1);

// `count` trailing buckets of the given granularity, ending with the one containing `now` —
// oldest first, matching lastMonths()'s existing convention.
export const lastActivityBuckets = (groupBy: ActivityGroupBy, count: number, now = new Date()): ActivityBucket[] => {
  return Array.from({ length: count }, (_, i) => {
    const offset = count - 1 - i;
    if (groupBy === 'day') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
      return { label: start.toLocaleDateString(undefined, { weekday: 'short' }), start, end };
    }
    if (groupBy === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      return { label: MONTH_LABELS[start.getMonth()], start, end };
    }
    if (groupBy === 'quarter') {
      const currentQuarterIndex = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3) - offset;
      const year = Math.floor(currentQuarterIndex / 4);
      const quarter = ((currentQuarterIndex % 4) + 4) % 4;
      return { label: `Q${quarter + 1} '${String(year).slice(-2)}`, start: quarterStart(year, quarter), end: quarterStart(year, quarter + 1) };
    }
    const start = new Date(now.getFullYear() - offset, 0, 1);
    const end = new Date(start.getFullYear() + 1, 0, 1);
    return { label: String(start.getFullYear()), start, end };
  });
};

export const countInRange = (dates: string[], start: Date, end: Date) =>
  dates.filter(d => { const t = new Date(d).getTime(); return t >= start.getTime() && t < end.getTime(); }).length;

// The four kinds of activity the bar chart/gauges can show, each toggleable independently — order
// matches how the filter chips read left to right.
export type ActivityCategory = 'checklist' | 'todo' | 'ticket' | 'delegation';
export const ACTIVITY_CATEGORY_ORDER: ActivityCategory[] = ['checklist', 'todo', 'ticket', 'delegation'];
export const ACTIVITY_CATEGORY_LABEL: Record<ActivityCategory, string> = {
  checklist: 'Checklist',
  todo: 'To-do',
  ticket: 'Ticket',
  delegation: 'Delegation',
};
// One navy family, not four unrelated hues — darkest for Checklist, stepping lighter through
// Ticket and Delegation down to Todo, so the stacked bar reads as one coherent brand palette
// instead of a mixed success/warning/info set. Checklist goes through its own
// `--color-activity-checklist` token (index.css) rather than a bare primary-900 — that's the
// family's near-black end, which disappears against the dark theme's own near-black surface; the
// token swaps to a light shade in dark mode so Checklist stays visible in both themes.
export const ACTIVITY_CATEGORY_COLOR: Record<ActivityCategory, string> = {
  checklist: 'var(--color-activity-checklist)',
  ticket: 'var(--color-activity-ticket)',
  delegation: 'var(--color-activity-delegation)',
  todo: 'var(--color-activity-todo)',
};
export const ACTIVITY_CATEGORY_DOT_CLASS: Record<ActivityCategory, string> = {
  checklist: 'bg-activity-checklist',
  ticket: 'bg-activity-ticket',
  delegation: 'bg-activity-delegation',
  todo: 'bg-activity-todo',
};

export interface ActivityWorkItem {
  id: string;
  /** Task title, ticket title, checklist instance title, or todo text — whatever that record's
   *  own display name is called. Powers the drill-down modal's row label. */
  title: string;
  /** Where clicking this item in a drill-down modal should navigate. Tasks/tickets open via the
   *  `?open=<id>` deep-link their own list pages already support; checklist instances have a real
   *  detail route; todos have neither, so they land on the plain list. */
  link: string;
  category: ActivityCategory;
  createdAt: string;
  completed: boolean;
  overdue: boolean;
  /** Missed its deadline: still open past due, or finished after it (delegations use verifiedAt,
   *  else updatedAt, as the finish time; tickets use closedAt vs the TAT). Falls back to `overdue`
   *  when absent. The on-time rate counts only items that are done or late, never open work that
   *  is not yet due. */
  late?: boolean;
  // Everyone who owns/is assigned to this item — a task/ticket has an owner plus one or more
  // assignees, a checklist instance can have several assignees, a todo has none client-side (it's
  // implicitly "mine"). Kept as an array (not a single userId) so the Compliance card's "Person"
  // filter can match on any of them rather than just the primary assignee.
  userIds: string[];
  // Ticket and Task carry a department; a checklist instance is store-scoped, not
  // department-scoped (there's no reliable department-to-store mapping — see
  // StoresPerformanceSection's own note on this), and a todo has neither — those come through
  // as null and simply won't match a Department/Store filter once one is applied.
  departmentId: string | null;
  storeId: string | null;
}

const inTimeRange = (createdAt: string, start: Date, end: Date) => {
  const t = new Date(createdAt).getTime();
  return t >= start.getTime() && t < end.getTime();
};

// Normalizes four differently-shaped record types into one common shape so the bar chart and
// compliance gauges can filter/aggregate them identically instead of each re-deriving its own
// per-kind "is this done / is this overdue" mapping.
export const buildActivityItems = (
  tasks: Task[],
  tickets: Ticket[],
  checklists: ChecklistInstance[],
  todos: Todo[],
  now: number,
): ActivityWorkItem[] => [
  ...tasks.map((t): ActivityWorkItem => ({
    id: t.id,
    title: t.title,
    link: `/tasks?open=${t.id}`,
    category: 'delegation',
    createdAt: t.createdAt,
    completed: t.status === 'done',
    overdue: isTaskOverdue(t, now),
    late:
      isTaskOverdue(t, now) ||
      (t.status === 'done' && !!t.dueDate && new Date(t.verifiedAt ?? t.updatedAt).getTime() > new Date(t.dueDate).getTime()),
    // additionalAssigneeIds is typed as always an array, but real records have been seen missing
    // it entirely — spreading a null/undefined value throws "is not iterable" at runtime, so it's
    // defaulted defensively here rather than trusting the type.
    userIds: [t.userId, t.assigneeId, ...(t.additionalAssigneeIds ?? [])].filter((id): id is string => !!id),
    departmentId: t.departmentId,
    storeId: null,
  })),
  ...tickets.map((t): ActivityWorkItem => ({
    id: t.id,
    title: t.title,
    link: `/tickets?open=${t.id}`,
    category: 'ticket',
    createdAt: t.createdAt,
    completed: t.status === 'CLOSED',
    overdue: t.isOverdue,
    late: isTicketLate(t),
    userIds: [t.userId, t.assigneeId].filter((id): id is string => !!id),
    departmentId: t.departmentId,
    storeId: t.storeId,
  })),
  ...checklists.map((c): ActivityWorkItem => {
    const total = c.items.length;
    const done = c.items.filter((i) => i.isDone).length;
    const completed = total > 0 && done === total;
    return {
      id: c.id,
      title: c.title,
      link: `/checklists/${c.id}`,
      category: 'checklist',
      // Checklist instances have no createdAt of their own — generatedAt (when this recurring
      // instance was spun up) is the closest equivalent for bucketing "when this happened".
      createdAt: c.generatedAt,
      completed,
      // Was `new Date(c.cutoffTime).getTime() < now` — cutoffTime is a bare "HH:mm" string, not a
      // full timestamp, so that parsed to Invalid Date/NaN and this could never actually fire.
      // instanceDeadline anchors cutoffTime (or falls back to periodEnd) to the instance's own
      // periodStart date, same real deadline the server now enforces.
      overdue: !completed && instanceDeadline(c) < now,
      userIds: c.assigneeIds ?? [],
      departmentId: null,
      storeId: c.storeId,
    };
  }),
  ...todos.map((t): ActivityWorkItem => ({
    id: t.id,
    title: t.text,
    // Todos have no standalone detail view or `?open=` deep link — the list page is the closest
    // thing to "the item" a drill-down link can point at.
    link: '/todo',
    category: 'todo',
    createdAt: t.createdAt,
    completed: t.completed,
    overdue: !t.completed && !!t.dueDate && new Date(t.dueDate).getTime() < now,
    // Todos carry no owner/department/store client-side — they're implicitly "mine" — so they
    // simply drop out once any Person/Department/Store filter is applied, rather than matching
    // as though they belonged to whoever's selected.
    userIds: [],
    departmentId: null,
    storeId: null,
  })),
];

/** Items of one category whose `createdAt` falls in `[start, end)` — the drill-down counterpart
 *  to `countItemsInRange`, used when a chart/gauge breakdown row is clicked and the actual records
 *  (not just their count) need to be shown. */
export const itemsInRange = (items: ActivityWorkItem[], category: ActivityCategory, start: Date, end: Date) =>
  items.filter((i) => i.category === category && inTimeRange(i.createdAt, start, end));

export const countItemsInRange = (items: ActivityWorkItem[], category: ActivityCategory, start: Date, end: Date) =>
  items.filter((i) => i.category === category && inTimeRange(i.createdAt, start, end)).length;

export type RateTone = 'success' | 'warning' | 'danger' | 'neutral';

// Below this many total items, a percentage is noise, not signal — "1 of 1 done" reading as a
// strong 100% (or "0 of 1" as an alarming 0%) tells you nothing. Neutral until there's enough
// volume for the number to actually mean something.
const RATE_VOLUME_FLOOR = 5;

// Below 50% reads as at-risk, 50-79% as on-track, 80%+ as strong — the same three-tier language
// the rest of the app uses for status tones, applied consistently everywhere a rate is shown.
export const rateTone = (percent: number, total: number): RateTone => {
  if (total < RATE_VOLUME_FLOOR) return 'neutral';
  if (percent >= 80) return 'success';
  if (percent >= 50) return 'warning';
  return 'danger';
};