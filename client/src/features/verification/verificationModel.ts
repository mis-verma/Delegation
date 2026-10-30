import { runScores } from '../checklist/checklistCompliance';
import { itemFlags, photoBreakdown } from '../checklist/instance/reviewFlags';
import type { ChecklistInstance } from '../../api/checklistInstances';

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
  compliance: number | null;
  badAnswers: number;
  missingPhotos: number;
  reusedPhotos: number;
  oldPhotos: number;
  weakPhotos: number;
  sentBackTimes: number;
  ticketsRaised: number;
  criticalFailed: number;
  photosNeeded: number;
  photosHave: number;
  needsLookCount: number;
  scored: number;
  good: number;
  answered: number;
  totalQuestions: number;
  clean: boolean;
  needsAttention: boolean;
}

export const computeRisk = (instance: Pick<ChecklistInstance, 'items'>): ChecklistRisk => {
  const scores = runScores(instance.items);
  let badAnswers = 0;
  let missingPhotos = 0;
  let reusedPhotos = 0;
  let oldPhotos = 0;
  let weakPhotos = 0;
  let sentBackTimes = 0;
  let ticketsRaised = 0;
  let photosNeeded = 0;
  let photosHave = 0;
  let needsLookCount = 0;
  for (const item of instance.items) {
    const flags = itemFlags(item);
    if (flags.bad) badAnswers += 1;
    if (flags.missingPhotos) missingPhotos += 1;
    if (flags.reusedPhoto) reusedPhotos += 1;
    if (flags.oldPhoto) oldPhotos += 1;
    if (flags.weakPhoto) weakPhotos += 1;
    if (flags.needsLook) needsLookCount += 1;
    const raised = item.reviewTicketId ? 1 : 0;
    ticketsRaised += raised;
    sentBackTimes += Math.max(0, item.sendBackCount - raised);
    if (!item.isNotApplicable && item.requiredImageCount > 0) {
      photosNeeded += 1;
      if (photoBreakdown(item).qualifying >= item.requiredImageCount) photosHave += 1;
    }
  }
  const criticalFailed = scores.criticalFailed;
  const needsAttention = badAnswers > 0 || missingPhotos > 0 || reusedPhotos > 0 || oldPhotos > 0 || weakPhotos > 0 || sentBackTimes > 0 || ticketsRaised > 0 || criticalFailed > 0;
  const compliant = scores.compliance === null || scores.compliance === 100;
  return {
    completion: scores.completion,
    compliance: scores.compliance,
    badAnswers,
    missingPhotos,
    reusedPhotos,
    oldPhotos,
    weakPhotos,
    sentBackTimes,
    ticketsRaised,
    criticalFailed,
    photosNeeded,
    photosHave,
    needsLookCount,
    scored: scores.scored,
    good: scores.good,
    answered: scores.done,
    totalQuestions: scores.total,
    clean: compliant && !needsAttention,
    needsAttention,
  };
};

export interface ChecklistRow {
  id: string;
  instance: ChecklistInstance;
  risk: ChecklistRisk;
  waitingSince: number;
  deadline: number;
  deptIds: string[];
  deptName: string;
  storeName: string | null;
  assigneeNames: string[];
  haystack: string;
}

export const waitingSinceOf = (instance: Pick<ChecklistInstance, 'submittedAt' | 'periodStart'>): number =>
  new Date(instance.submittedAt ?? instance.periodStart).getTime();

export const formatWaiting = (since: number, now: number): string => {
  const diff = Math.max(0, now - since);
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return '<1 hour';
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.floor(diff / DAY_MS);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
};

const byCompliance = (a: ChecklistRow, b: ChecklistRow) => {
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

export type QueueGroup = 'critical' | 'attention' | 'ready';

const GROUP_RANK: Record<QueueGroup, number> = { critical: 0, attention: 1, ready: 2 };

export const groupOf = (row: ChecklistRow): QueueGroup =>
  row.risk.criticalFailed > 0 ? 'critical' : row.risk.needsAttention ? 'attention' : 'ready';

const resubmitted = (row: ChecklistRow) => ((row.instance.rejectionCount ?? 0) > 0 ? 0 : 1);

export const sortChecklistRows = (rows: ChecklistRow[], sort: SortKey): ChecklistRow[] => {
  const compare = COMPARATORS[sort];
  return [...rows].sort((a, b) => GROUP_RANK[groupOf(a)] - GROUP_RANK[groupOf(b)] || resubmitted(a) - resubmitted(b) || compare(a, b));
};
