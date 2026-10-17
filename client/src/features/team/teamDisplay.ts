
import type { Task } from '../../api/task';
import type { Ticket } from '../../api/ticket';

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
// Period
// ---------------------------------------------------------------------------

export type TeamPeriod = 'today' | 'week' | 'month' | 'last30';

export interface TeamPeriodRange {
  /** Org-local calendar days, YYYY-MM-DD, both inclusive. What the checklist report takes. */
  from: string;
  to: string;
  /** The same window as real instants, for filtering tickets/tasks by createdAt and for the
   *  task-checklist (photo proof) report. */
  startMs: number;
  endMs: number;
}

/** Tickets and delegations count toward the period they were created in. Every period ends today,
 *  so only the start bound filters: something raised after the range was computed (the page left
 *  open past midnight) still counts instead of silently dropping out. */
const isInTeamPeriod = (createdAt: string, range: Pick<TeamPeriodRange, 'startMs'>) =>
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
    (!departmentId || t.departmentId === departmentId)
    && t.status !== 'draft'
    && (t.assigneeId === personId || t.userId === personId || t.additionalAssigneeIds.includes(personId))
    && isInTeamPeriod(t.createdAt, range)),
  tickets: tickets.filter((t) =>
    (!departmentId || t.departmentId === departmentId)
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
