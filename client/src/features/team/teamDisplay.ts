import type { ChecklistReportMetrics } from '../../api/checklistReports';
import type { Task } from '../../api/task';
import type { Ticket } from '../../api/ticket';
import { ENTITY_CARD_CLASS } from '../../components/entityCard';
import { cn } from '../../lib/utils';
import { todayPeriodBoundIso } from '../checklist/checklistDisplay';

// Plain functions and constants live in this .ts file, not alongside the card components: a plain
// export next to components breaks Vite's Fast Refresh boundary for that file.

/** One overdue ticket or task: enough to list it and jump straight to it. */
export interface OverdueItem {
  id: string;
  title: string;
  link: string;
  kind: 'ticket' | 'task';
}

// ---------------------------------------------------------------------------
// Card chrome shared by DepartmentCard and PersonCard
// ---------------------------------------------------------------------------

/** The card is a plain `div`; its name is a real button (TEAM_CARD_LINK_CLASS) whose ::after
 *  stretches over the whole card, so the card is one keyboard-focusable click target while the
 *  overdue badge (relative z-10) stays its own independent control. Hover is the border colour
 *  from ENTITY_CARD_CLASS plus a small press; no entrance animation, so a period change never
 *  replays it. */
export const TEAM_CARD_CLASS = cn(
  ENTITY_CARD_CLASS,
  'gap-3 sm:p-4 cursor-pointer active:scale-[0.985] transition-[border-color,transform] duration-150 ease-out',
);

export const TEAM_CARD_LINK_CLASS =
  'text-left t-card font-display font-bold leading-snug line-clamp-2 text-text break-words outline-none ' +
  'after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-primary-500/40 cursor-pointer';

// ---------------------------------------------------------------------------
// Period
// ---------------------------------------------------------------------------

export type TeamPeriod = 'today' | 'week' | 'month' | 'last30';

export const TEAM_PERIOD_OPTIONS: { key: TeamPeriod; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'last30', label: 'Last 30 days' },
];

/** The same options in the shape PeriodTabControl takes. */
export const TEAM_PERIOD_KEYS = TEAM_PERIOD_OPTIONS.map((o) => o.key);
export const TEAM_PERIOD_LABELS = Object.fromEntries(TEAM_PERIOD_OPTIONS.map((o) => [o.key, o.label])) as Record<TeamPeriod, string>;

/** Reads after a verb or noun: "created this week", "Store checklists, in the last 30 days". */
export const TEAM_PERIOD_PHRASE: Record<TeamPeriod, string> = {
  today: 'today',
  week: 'this week',
  month: 'this month',
  last30: 'in the last 30 days',
};

export interface TeamPeriodRange {
  /** Org-local calendar days, YYYY-MM-DD, both inclusive. What the checklist report takes. */
  from: string;
  to: string;
  /** The same window as real instants, for filtering tickets/tasks by createdAt and for the
   *  task-checklist (photo proof) report. */
  startMs: number;
  endMs: number;
}

const DAY_MS = 86_400_000;
// Same org offset as ORG_TZ_OFFSET_MS in checklistDisplay.ts (not exported there) and the server's
// CHECKLIST_TIMEZONE_OFFSET_MINUTES default: periodStart days are org-local, not the viewer's.
const ORG_TZ_OFFSET_MS = 330 * 60_000;

const dayString = (utcMidnightMs: number) => new Date(utcMidnightMs).toISOString().slice(0, 10);

/** Org-local from/to for the selected period. "Week" starts on Monday, "month" on the 1st, and
 *  every period ends today (nothing in the future has run yet). */
export const teamPeriodRange = (period: TeamPeriod): TeamPeriodRange => {
  const today = todayPeriodBoundIso().slice(0, 10);
  const todayMs = Date.parse(`${today}T00:00:00.000Z`);
  const todayDate = new Date(todayMs);

  let fromMs = todayMs;
  if (period === 'week') fromMs = todayMs - ((todayDate.getUTCDay() + 6) % 7) * DAY_MS;
  else if (period === 'month') fromMs = Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), 1);
  else if (period === 'last30') fromMs = todayMs - 29 * DAY_MS;

  return {
    from: dayString(fromMs),
    to: today,
    startMs: fromMs - ORG_TZ_OFFSET_MS,
    endMs: todayMs + DAY_MS - ORG_TZ_OFFSET_MS - 1,
  };
};

/** Tickets and delegations count toward the period they were created in. Every period ends today,
 *  so only the start bound filters: something raised after the range was computed (the page left
 *  open past midnight) still counts instead of silently dropping out. */
export const isInTeamPeriod = (createdAt: string, range: Pick<TeamPeriodRange, 'startMs'>) =>
  Date.parse(createdAt) >= range.startMs;

/** One person's tickets and tasks in one department and period: the single rule behind both the
 *  person card and the person screen, so the two can never disagree. A task counts for its main
 *  assignee, its extra assignees and its creator; a ticket for its assignee and its raiser. */
export const selectPersonWork = (
  tasks: Task[],
  tickets: Ticket[],
  personId: string,
  departmentId: string,
  range: Pick<TeamPeriodRange, 'startMs'>,
) => ({
  tasks: tasks.filter((t) =>
    t.departmentId === departmentId
    && (t.assigneeId === personId || t.userId === personId || t.additionalAssigneeIds.includes(personId))
    && isInTeamPeriod(t.createdAt, range)),
  tickets: tickets.filter((t) =>
    t.departmentId === departmentId
    && (t.assigneeId === personId || t.userId === personId)
    && isInTeamPeriod(t.createdAt, range)),
});

// ---------------------------------------------------------------------------
// Card numbers: tickets + delegations + store checklist runs
// ---------------------------------------------------------------------------

/** 'loading' until the report first resolves, 'error' if it failed (ticket/delegation numbers
 *  still show), 'ready' once the numbers are real. */
export type ReportState = 'loading' | 'error' | 'ready';

export const EMPTY_CHECKLIST_METRICS: ChecklistReportMetrics = {
  assigned: 0,
  completed: 0,
  completionPct: null,
  onTime: 0,
  onTimePct: null,
  missed: 0,
  submitted: 0,
  approved: 0,
  sentBack: 0,
  questionsDone: 0,
  notApplicable: 0,
  answersChecked: 0,
  compliancePct: null,
};

export interface WorkTotals {
  /** Closed tickets + done delegations. */
  done: number;
  /** Every ticket + delegation raised for this department/person in the period. */
  total: number;
  overdue: number;
}

/** The app-wide "Overall score": completion and compliance counted equally, i.e. the average of
 *  whichever of the two exist (completion alone until anything was checked). null with neither. */
export const overallScore = (completion: number | null, compliance: number | null) => {
  const parts = [completion, compliance].filter((v): v is number => v != null);
  return parts.length > 0 ? Math.round(parts.reduce((sum, v) => sum + v, 0) / parts.length) : null;
};

export interface CardNumbers {
  /** Completion: (closed tickets + done tasks + completed checklist runs) / (tickets + tasks +
   *  assigned runs); null when there is nothing to measure, so a quiet card never reads as a 0%
   *  failure. */
  rate: number | null;
  /** Overall score from `rate` and `compliance` (see overallScore). */
  score: number | null;
  done: number;
  total: number;
  /** Overdue tickets/tasks plus missed checklist runs. */
  overdue: number;
  missedChecklists: number;
  /** Assigned checklist runs in the period not completed yet; null while the report has no answer. */
  openChecklists: number | null;
  /** Checklist compliance %, only when the report scored at least one answer. */
  compliance: number | null;
}

export const summarizeCard = (work: WorkTotals, checklist: ChecklistReportMetrics | undefined, state: ReportState): CardNumbers => {
  // A person/department with no row in a ready report simply had no checklist runs.
  const m = state === 'ready' ? checklist ?? EMPTY_CHECKLIST_METRICS : EMPTY_CHECKLIST_METRICS;
  const total = work.total + m.assigned;
  const done = work.done + m.completed;
  const rate = total > 0 ? Math.round((done / total) * 100) : null;
  const compliance = state === 'ready' && m.answersChecked > 0 ? m.compliancePct : null;
  return {
    rate,
    score: overallScore(rate, compliance),
    done,
    total,
    overdue: work.overdue + m.missed,
    missedChecklists: m.missed,
    openChecklists: state === 'ready' ? Math.max(m.assigned - m.completed, 0) : null,
    compliance,
  };
};
