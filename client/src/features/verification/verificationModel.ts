import { runScores } from '../checklist/checklistCompliance';
import { itemFlags } from '../checklist/instance/reviewFlags';
import type { ChecklistInstance } from '../../api/checklistInstances';

// Pure helpers for the Verification page: the risk read-out for a checklist run, its sort order,
// and the small bits of text built from them. No React in here, so rows can memoise on the output.

export const UNASSIGNED = '__unassigned__';
export const ALL = 'all';

export type QueueView = 'waiting' | 'decided';
export type QueueTab = 'all' | 'checklists' | 'tickets' | 'delegations';
export type SortKey = 'oldest' | 'overdue' | 'compliance' | 'newest';
export type AgeFilter = 'any' | '1' | '3' | '7';

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'oldest', label: 'Oldest first' },
  { value: 'overdue', label: 'Most overdue' },
  { value: 'compliance', label: 'Lowest compliance' },
  { value: 'newest', label: 'Newest' },
];

export const AGE_OPTIONS: { value: AgeFilter; label: string }[] = [
  { value: 'any', label: 'Any age' },
  { value: '1', label: '1+ day old' },
  { value: '3', label: '3+ days old' },
  { value: '7', label: '7+ days old' },
];

export const DAY_MS = 86_400_000;

export interface ChecklistRisk {
  completion: number;
  /** Weighted compliance %, null when nothing in the run is scored. */
  compliance: number | null;
  badAnswers: number;
  missingPhotos: number;
  /** Total number of times questions in this run were sent back before. */
  sentBackTimes: number;
  ticketsRaised: number;
  criticalFailed: number;
  /** Questions that need photos, and how many of those have them all. */
  photosNeeded: number;
  photosHave: number;
  /** How many questions the review pane lists under "Needs a look". */
  needsLookCount: number;
  /** Safe to approve without opening: fully compliant, photos in, never sent back. */
  clean: boolean;
  /** Any bad answer, missing photo, send-back history or critical failure. */
  needsAttention: boolean;
}

export const computeRisk = (instance: Pick<ChecklistInstance, 'items'>): ChecklistRisk => {
  const scores = runScores(instance.items);
  let badAnswers = 0;
  let missingPhotos = 0;
  let sentBackTimes = 0;
  let ticketsRaised = 0;
  let photosNeeded = 0;
  let photosHave = 0;
  let needsLookCount = 0;
  for (const item of instance.items) {
    const flags = itemFlags(item);
    if (flags.bad) badAnswers += 1;
    if (flags.missingPhotos) missingPhotos += 1;
    if (flags.needsLook) needsLookCount += 1;
    const raised = item.reviewTicketId ? 1 : 0;
    ticketsRaised += raised;
    sentBackTimes += Math.max(0, item.sendBackCount - raised);
    if (!item.isNotApplicable && item.requiredImageCount > 0) {
      photosNeeded += 1;
      if (item.images.length >= item.requiredImageCount) photosHave += 1;
    }
  }
  const criticalFailed = scores.criticalFailed;
  const needsAttention = badAnswers > 0 || missingPhotos > 0 || sentBackTimes > 0 || ticketsRaised > 0 || criticalFailed > 0;
  const compliant = scores.compliance === null || scores.compliance === 100;
  return {
    completion: scores.completion,
    compliance: scores.compliance,
    badAnswers,
    missingPhotos,
    sentBackTimes,
    ticketsRaised,
    criticalFailed,
    photosNeeded,
    photosHave,
    needsLookCount,
    clean: compliant && !needsAttention,
    needsAttention,
  };
};

/** One checklist run as the queue shows it: the run plus everything derived once, not per render. */
export interface ChecklistRow {
  id: string;
  instance: ChecklistInstance;
  risk: ChecklistRisk;
  /** When the run started waiting for a reviewer (submitted time, else the period start). */
  waitingSince: number;
  deadline: number;
  /** Department ids of the people assigned, or [UNASSIGNED] when none is known. */
  deptIds: string[];
  deptName: string;
  storeName: string | null;
  assigneeNames: string[];
  /** Lower-cased title, store and people, for the search box. */
  haystack: string;
}

export const waitingSinceOf = (instance: Pick<ChecklistInstance, 'submittedAt' | 'periodStart'>): number =>
  new Date(instance.submittedAt ?? instance.periodStart).getTime();

/** "Under an hour", "5 hours", "1 day", "3 days" — how long something has been waiting. */
export const formatWaiting = (since: number, now: number): string => {
  const diff = Math.max(0, now - since);
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return 'Under an hour';
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.floor(diff / DAY_MS);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
};

const byCompliance = (a: ChecklistRow, b: ChecklistRow) => {
  // Unscored runs count as 100%, the same as they are shown, so they sort after every run that failed something.
  const ac = a.risk.compliance ?? 100;
  const bc = b.risk.compliance ?? 100;
  return ac - bc || a.waitingSince - b.waitingSince;
};

const COMPARATORS: Record<SortKey, (a: ChecklistRow, b: ChecklistRow) => number> = {
  oldest: (a, b) => a.waitingSince - b.waitingSince,
  newest: (a, b) => b.waitingSince - a.waitingSince,
  overdue: (a, b) => a.deadline - b.deadline || a.waitingSince - b.waitingSince,
  compliance: byCompliance,
};

/** Sorts without touching the input. Runs with a critical failure float to the top, whatever the sort. */
export const sortChecklistRows = (rows: ChecklistRow[], sort: SortKey): ChecklistRow[] => {
  const compare = COMPARATORS[sort];
  return [...rows].sort((a, b) => {
    const critical = Number(b.risk.criticalFailed > 0) - Number(a.risk.criticalFailed > 0);
    return critical || compare(a, b);
  });
};
