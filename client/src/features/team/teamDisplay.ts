import type { ChecklistReportMetrics } from '../../api/checklistReports';
import { ENTITY_CARD_CLASS } from '../../components/entityCard';
import { cn } from '../../lib/utils';
import { todayPeriodBoundIso } from '../checklist/checklistDisplay';

/** One overdue ticket or task: enough to list it and jump straight to it. */
export interface OverdueItem {
  id: string;
  title: string;
  link: string;
  kind: 'ticket' | 'task';
}

/** Shared by DepartmentCard and PersonCard: the gauge is a completion rate measured against an
 *  implicit "should be closing most of what's raised" target, so it earns the red->amber->green
 *  read every other performance-vs-target gauge in the app uses, instead of staying one flat
 *  navy tone regardless of whether the number is 12% or 96%. Neutral (border-toned) with no data,
 *  since a department/person that hasn't raised anything yet isn't a performance problem.
 *
 *  Lives in a plain .ts file, not alongside the card components: a plain function exported next
 *  to components breaks Vite's Fast Refresh boundary for that file. */
export const completionGaugeColor = (rate: number | null) => {
  if (rate == null) return 'var(--color-border)';
  if (rate >= 80) return 'var(--color-success)';
  if (rate >= 50) return 'var(--color-warning)';
  return 'var(--color-danger)';
};

// ---------------------------------------------------------------------------
// Card chrome shared by DepartmentCard and PersonCard
// ---------------------------------------------------------------------------

/** The card is a plain `div`; its name is a real button (TEAM_CARD_LINK_CLASS) whose ::after
 *  stretches over the whole card, so the card is one keyboard-focusable click target while the
 *  overdue badge (relative z-10) stays its own independent control. */
export const TEAM_CARD_CLASS = cn(
  ENTITY_CARD_CLASS,
  'gap-3 sm:p-4 animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none',
);

export const TEAM_CARD_LINK_CLASS =
  'text-left text-sm font-display font-bold text-text break-words outline-none transition-colors duration-200 ease-in-out ' +
  'after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-primary-500/40 ' +
  'group-hover:text-primary-600 dark:group-hover:text-primary-400 cursor-pointer';

/** Staggered entrance, capped at 8 steps so a long roster's last card isn't left waiting. */
export const staggerStyle = (index: number) => ({ animationFillMode: 'backwards' as const, animationDelay: `${Math.min(index, 8) * 40}ms` });

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
  /** Every ticket + delegation ever raised for this department/person. */
  total: number;
  overdue: number;
}

export interface CardNumbers {
  /** (closed tickets + done tasks + completed checklist runs) / (tickets + tasks + assigned runs);
   *  null when there is nothing to measure, so a quiet card never reads as a 0% failure. */
  rate: number | null;
  done: number;
  total: number;
  /** Overdue tickets/tasks plus missed checklist runs. */
  overdue: number;
  missedChecklists: number;
  /** Assigned checklist runs in the period; null while the report has no answer yet. */
  checklists: number | null;
  /** Checklist compliance %, only when the report scored at least one answer. */
  compliance: number | null;
}

export const summarizeCard = (work: WorkTotals, checklist: ChecklistReportMetrics | undefined, state: ReportState): CardNumbers => {
  // A person/department with no row in a ready report simply had no checklist runs.
  const m = state === 'ready' ? checklist ?? EMPTY_CHECKLIST_METRICS : EMPTY_CHECKLIST_METRICS;
  const total = work.total + m.assigned;
  const done = work.done + m.completed;
  return {
    rate: total > 0 ? Math.round((done / total) * 100) : null,
    done,
    total,
    overdue: work.overdue + m.missed,
    missedChecklists: m.missed,
    checklists: state === 'ready' ? m.assigned : null,
    compliance: state === 'ready' && m.answersChecked > 0 ? m.compliancePct : null,
  };
};
