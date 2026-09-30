import { CircleDashed, Eye, ShieldCheck, ShieldX, type LucideIcon } from 'lucide-react';
import type { ChecklistRecurrence } from '../../api/checklistDefinitions';
import type { ChecklistVerificationStatus, ChecklistInstanceItem } from '../../api/checklistInstances';

// Shared display lookups/helpers for the checklist feature — used by ChecklistDefinitionList,
// ChecklistDefinitionDetail, ChecklistInstanceDetail, and MyChecklists. Previously each of those
// files redefined its own copy of these.

export const RECURRENCE_LABEL: Record<ChecklistRecurrence, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  YEARLY: 'Yearly',
  ONE_TIME: 'One-time',
};

// periodStart/periodEnd/startDate are calendar-day labels stored as UTC midnight of the intended
// day (see server/src/utils/period.ts) — rendering them with the viewer's local timezone can roll
// them back a day for anyone whose browser clock sits behind UTC. Pinning timeZone: 'UTC' makes
// the displayed date match the label exactly, for every viewer, regardless of local system time.

// e.g. "Jan 5, 2026" — used where the year matters (definition/instance detail pages).
export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

// e.g. "Jan 5" — used in tighter card layouts (MyChecklists) where the year is implied.
export const formatDateShort = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

// completedAt/generatedAt/image createdAt are real timestamps (not calendar-day labels like
// periodStart/periodEnd above), so these render in the viewer's own local time zone rather than
// pinning UTC — "2:45 PM" should mean 2:45 PM for whoever's looking at it.
// e.g. "Aug 31, 2026 · 2:45 PM" — completion/verification timestamps on item and instance cards.
export const formatDateTime = (iso: string) =>
  `${new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · ${new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;

// e.g. "2:45 PM" — compact caption under an individual evidence photo/video thumbnail.
export const formatTimeOnly = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

// Derived from item completion, not stored on the instance — mirrors what ChecklistInstanceCard's
// `isComplete` check already computed inline, generalized to the third "some done" bucket used by
// ChecklistDefinitionDetail's grouped instance list.
export type InstanceProgressStatus = 'TODO' | 'IN_PROGRESS' | 'COMPLETED';

export const instanceProgressStatus = (done: number, total: number): InstanceProgressStatus => {
  if (total > 0 && done === total) return 'COMPLETED';
  if (done > 0) return 'IN_PROGRESS';
  return 'TODO';
};

export const INSTANCE_STATUS_LABEL: Record<InstanceProgressStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
};

export const INSTANCE_STATUS_STYLE: Record<InstanceProgressStatus, string> = {
  TODO: 'bg-surface-hover text-text-muted border-border',
  IN_PROGRESS: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  COMPLETED: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
};

export const VERIFICATION_STATUS_LABEL: Record<ChecklistVerificationStatus, string> = {
  NOT_SUBMITTED: 'Not submitted',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED: 'Verified',
  REJECTED: 'Rejected',
};

// Icon-chip look for each verification status (solid icon circle + label), for cards and the
// filter sheet — same chip language as status and priority everywhere else.
export const VERIFICATION_CHIP: Record<ChecklistVerificationStatus, { icon: LucideIcon; tone: string }> = {
  NOT_SUBMITTED: { icon: CircleDashed, tone: 'bg-text-light' },
  PENDING_APPROVAL: { icon: Eye, tone: 'bg-primary-600' },
  APPROVED: { icon: ShieldCheck, tone: 'bg-success' },
  REJECTED: { icon: ShieldX, tone: 'bg-danger' },
};

// Shared mapping from the verification workflow status to a `Badge` tone — every place that
// shows verification status (ChecklistInstanceCard, ChecklistInstanceRow, ChecklistInstanceTable)
// should render the same variant for the same status, not each hand-roll its own colors.
export const VERIFICATION_BADGE_VARIANT: Record<ChecklistVerificationStatus, 'neutral' | 'warning' | 'success' | 'destructive'> = {
  NOT_SUBMITTED: 'neutral',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'success',
  REJECTED: 'destructive',
};

// Shared tri-color convention for a HISTORICAL/AGGREGATE 0-100 rate — a definition's
// completion/compliance rate across every instance it's ever generated (ChecklistDefinitionCard,
// ChecklistDefinitionDetail) — same reasoning as TaskScoreBadge's coloring on the Delegations
// side: a healthy long-run rate reads differently from one that needs attention.
//
// Do NOT use this for a single still-open instance's own live fill percentage — a checklist at
// 30% that isn't due for hours is completely normal, not a problem, so tinting its bar red just
// because it's less than 50% done would flag every checklist as "urgent" the moment it's
// generated. Use instanceProgressToneClass/instanceProgressBarClass for that instead, which key
// off overdue/complete rather than raw fill%.
export const rateToneClass = (rate: number) => {
  if (rate >= 80) return 'text-success';
  if (rate >= 50) return 'text-warning';
  return 'text-danger';
};

export const rateBarClass = (rate: number) => {
  if (rate >= 80) return 'bg-success';
  if (rate >= 50) return 'bg-warning';
  return 'bg-danger';
};

// For rates where a HIGHER number is worse news (e.g. issueRate/flagged-answer rate) — same
// thresholds as rateToneClass/rateBarClass, just read from the other end.
export const inverseRateToneClass = (rate: number) => {
  if (rate <= 20) return 'text-success';
  if (rate <= 50) return 'text-warning';
  return 'text-danger';
};

export const inverseRateBarClass = (rate: number) => {
  if (rate <= 20) return 'bg-success';
  if (rate <= 50) return 'bg-warning';
  return 'bg-danger';
};

// A single instance's own progress bar/text should read "on track" vs. "actually a problem" —
// which is about the deadline, not the raw fill%. Complete is always success; overdue-and-not-
// complete is the only case that should read as danger; everything else (partially filled, still
// within its window) is a neutral in-progress tone, not an escalating red the closer it is to 0%.
export const instanceProgressToneClass = (overdue: boolean, isComplete: boolean) => {
  if (isComplete) return 'text-success';
  if (overdue) return 'text-danger';
  return 'text-primary-600 dark:text-primary-400';
};

export const instanceProgressBarClass = (overdue: boolean, isComplete: boolean) => {
  if (isComplete) return 'bg-success';
  if (overdue) return 'bg-danger';
  return 'bg-primary-500';
};

type InstanceWindow = {
  periodStart: string;
  periodEnd: string;
  opensTime: string | null;
  cutoffTime: string | null;
};

// When the instance actually becomes fillable — opensTime anchored to periodStart's calendar
// date, same convention as instanceDeadline below. Null means no opening gate (always open since
// generation) rather than "opens at midnight".
// opensTime/cutoffTime are org-local wall-clock times (India), and periodStart is that local day
// written as UTC midnight — so the real instant is "day + HH:mm" minus the org's UTC offset. Same
// value as the server's CHECKLIST_TIMEZONE_OFFSET_MINUTES default. Without this every opening
// gate and deadline landed 5½ hours late ("opens 09:00" really opened at 14:30).
const ORG_TZ_OFFSET_MS = 330 * 60_000;

// Today's periodStart bound, as the `from`/`to` filter (checklistInstance.service.ts's
// instanceConditions) expects it: an ISO string matching periodStart's own UTC-midnight-labeled
// convention. Shift "now" into org-local wall-clock time first, then take THAT day's UTC midnight
// — using the viewer's own local midnight here would drift a device in a different time zone off
// by however many hours it's offset from the org.
export const todayPeriodBoundIso = (): string => {
  const local = new Date(Date.now() + ORG_TZ_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())).toISOString();
};

export const instanceOpensAt = (instance: Pick<InstanceWindow, 'periodStart' | 'opensTime'>): number | null => {
  if (!instance.opensTime) return null;
  const [hours, minutes] = instance.opensTime.split(':').map(Number);
  const start = new Date(instance.periodStart);
  return Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), hours, minutes, 0, 0) - ORG_TZ_OFFSET_MS;
};

// The instance's real deadline: cutoffTime (a same-day time-of-window anchored to periodStart's
// calendar date) when set, else periodEnd — mirrors checklistInstance.service.ts's deadlineExpr
// exactly, including the overnight-window case: real checklists in this app open in the evening
// and cut off the next morning (e.g. opens 18:00, cutoff 07:00), so a cutoff clock-time earlier
// than the opens clock-time rolls the deadline to the next calendar day, not the same one.
// periodStart is a UTC-midnight calendar-day label (see formatDate's comment above), so the
// cutoff time-of-day is anchored to it in UTC too, not the viewer's local time zone.
export const instanceDeadline = (instance: InstanceWindow): number => {
  if (!instance.cutoffTime) return new Date(instance.periodEnd).getTime() - ORG_TZ_OFFSET_MS;
  const [hours, minutes] = instance.cutoffTime.split(':').map(Number);
  const start = new Date(instance.periodStart);
  const deadline = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), hours, minutes, 0, 0));
  if (instance.opensTime && instance.cutoffTime < instance.opensTime) {
    deadline.setUTCDate(deadline.getUTCDate() + 1);
  }
  return deadline.getTime() - ORG_TZ_OFFSET_MS;
};

// Displays the real deadline instanceDeadline() computes — null when there's no cutoffTime (the
// deadline is just periodEnd's own calendar day, already shown by formatDate/formatDateShort
// elsewhere, nothing new to add). Every list/card surface used to only ever print periodStart–
// periodEnd at day granularity, so the one place the actual time-of-day cutoff showed up was the
// binary Overdue chip — AFTER it was already missed. UTC-pinned, same reasoning as formatDate:
// cutoffTime is a wall-clock time the admin configured (e.g. "7:00 AM"), not a per-viewer instant,
// so it must read the same for every viewer regardless of their own timezone. Also doubles as the
// one place an overnight window's rollover becomes visible — "18:00 → 07:00" shows as landing on
// the NEXT calendar day here, instead of just being silently computed that way internally.
export const formatDeadlineTime = (instance: InstanceWindow): string | null => {
  if (!instance.cutoffTime) return null;
  // Shifted back to the local wall clock and printed in UTC, so it reads exactly what the admin
  // typed ("7:00 AM") for every viewer.
  return new Date(instanceDeadline(instance) + ORG_TZ_OFFSET_MS).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC',
  });
};

// An instance is overdue once its deadline has passed without every item being done — mirrors
// Task's own dueDate-passed check.
export const isInstanceOverdue = (instance: InstanceWindow, isComplete: boolean) =>
  !isComplete && instanceDeadline(instance) < Date.now();

// True from generation until opensTime — matches the same window checklistInstance.service.ts's
// setItemDone enforces server-side (rejects marking an item done before this).
export const isInstanceNotYetOpen = (instance: Pick<InstanceWindow, 'periodStart' | 'opensTime'>) => {
  const opensAt = instanceOpensAt(instance);
  return opensAt != null && Date.now() < opensAt;
};

type FlaggableItem = Pick<ChecklistInstanceItem, 'itemType' | 'booleanAnswer' | 'yesActions' | 'noActions'>;

// Mirrors the server's GATED_BOOLEAN_ITEM_EXPR/FLAGGED_BOOLEAN_ANSWER_EXPR (see
// server/src/utils/checklistBooleanFlags.ts) — a Yes/No-style item is "gated" when exactly one
// branch has a conditional action wired up (that's the branch the checklist's author flagged as
// needing scrutiny), and a "flagged" answer is one that actually landed on that branch. Stays
// flagged even once a required photo/reason was supplied to get past it — those only unblock
// completion, they never turn a flagged answer back into a clean one.
export const isGatedBooleanItem = (item: FlaggableItem) => {
  if (item.itemType !== 'YES_NO' && item.itemType !== 'PASS_FAIL') return false;
  const noGated = item.noActions.length > 0 && item.yesActions.length === 0;
  const yesGated = item.yesActions.length > 0 && item.noActions.length === 0;
  return noGated || yesGated;
};

export const isFlaggedAnswer = (item: FlaggableItem) => {
  if (!isGatedBooleanItem(item)) return false;
  if (item.booleanAnswer === 'NO') return item.noActions.length > 0;
  if (item.booleanAnswer === 'YES') return item.yesActions.length > 0;
  return false;
};
