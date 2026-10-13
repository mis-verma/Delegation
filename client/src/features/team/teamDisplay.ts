import type { ScoreReportRow } from '../../api/scores';
import { acrossModules, overallOf } from '../dashboard/scoreMetrics';
import type { Task } from '../../api/task';
import type { Ticket } from '../../api/ticket';
import { ENTITY_CARD_CLASS } from '../../components/entityCard';
import { cn } from '../../lib/utils';

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

/** Org-local from/to for the selected period. `today` is the org's calendar day (useOrgToday), so the window
 *  rolls over at the org's midnight, never the device clock. "Week" starts on Monday, "month" on the 1st, and
 *  every period ends today (nothing in the future has run yet). */
export const teamPeriodRange = (period: TeamPeriod, today: string): TeamPeriodRange => {
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

/** One person's tickets and delegations CREATED in one department and period: the cohort behind the person
 *  screen's category bars (not the scores, which count what came due). A task counts for its main assignee,
 *  its extra assignees and its creator; a ticket for its assignee and its raiser. Drafts are left out. */
export const selectPersonWork = (
  tasks: Task[],
  tickets: Ticket[],
  personId: string,
  departmentId: string,
  range: Pick<TeamPeriodRange, 'startMs'>,
) => ({
  tasks: tasks.filter((t) =>
    t.departmentId === departmentId
    && t.status !== 'draft'
    && (t.assigneeId === personId || t.userId === personId || t.additionalAssigneeIds.includes(personId))
    && isInTeamPeriod(t.createdAt, range)),
  tickets: tickets.filter((t) =>
    t.departmentId === departmentId
    && (t.assigneeId === personId || t.userId === personId)
    && isInTeamPeriod(t.createdAt, range)),
});

// ---------------------------------------------------------------------------
// Card numbers: the scores report (same as the Scorecard) plus open work now
// ---------------------------------------------------------------------------

/** 'loading' until the scores report first resolves, 'error' if it failed, 'ready' once the numbers are real. */
export type ReportState = 'loading' | 'error' | 'ready';

/**
 * What a card shows. Overall, Completion, On time and the counts are the scores report's own figures for the
 * period (what came DUE in it), the same rows the Scorecard shows, so Team Overview, Scorecard and Report
 * agree. Open work (tickets, delegations, checklists) is a separate "Open now" figure: it is today's
 * open work, not part of any percentage.
 */
export interface CardNumbers {
  /** Overall score: completion and compliance of every module with something due, counted equally. */
  score: number | null;
  /** Completion across the modules: done out of due. Null when nothing was due. */
  completion: number | null;
  /** Of what was finished, the share finished on time. */
  onTime: number | null;
  done: number;
  due: number;
  /** Finished, but after the deadline. */
  late: number;
  /** Due and not done. */
  notDone: number;
  /** Checklist answers right (compliance), only when answers were checked. */
  compliance: number | null;
  /** Checklist runs that came due and were not filled. */
  missedChecklists: number;
  /** Checklist runs still open before their cutoff; null while the report has no answer. */
  openChecklists: number | null;
}

export const summarizeCard = (row: ScoreReportRow | undefined, state: ReportState): CardNumbers => {
  // A person or department with no row in a ready report simply had nothing due.
  if (state !== 'ready' || !row) {
    return { score: null, completion: null, onTime: null, done: 0, due: 0, late: 0, notDone: 0, compliance: null, missedChecklists: 0, openChecklists: state === 'ready' ? 0 : null };
  }
  const across = acrossModules(row);
  return {
    score: overallOf(row),
    completion: across.completion,
    onTime: across.ontime,
    done: across.done,
    due: across.due,
    late: across.late,
    notDone: across.notDone,
    compliance: row.checklist.compliancePct,
    missedChecklists: row.checklist.missed,
    openChecklists: row.checklist.open ?? 0,
  };
};
