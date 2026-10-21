import { CircleDashed, Eye, Send, ShieldCheck, ShieldX, type LucideIcon } from 'lucide-react';
import type { ChecklistRecurrence } from '../../api/checklistDefinitions';
import type { ChecklistVerificationStatus, ChecklistInstanceItem } from '../../api/checklistInstances';
import type { StatusChipStatus } from '../../components/statusChip';
import { runScores } from './checklistCompliance';

export const RECURRENCE_LABEL: Record<ChecklistRecurrence, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  YEARLY: 'Yearly',
  ONE_TIME: 'One-time',
};

const DATE_LONG_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const DATE_SHORT_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const DATE_LOCAL_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const TIME_LOCAL_FMT = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const DEADLINE_FMT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });

export const formatDate = (iso: string) => DATE_LONG_FMT.format(new Date(iso));

export const formatPeriodSpan = (instance: { periodStart: string; periodEnd: string }, short = false): string => {
  const fmt = short ? formatDateShort : formatDate;
  const last = new Date(new Date(instance.periodEnd).getTime() - 24 * 60 * 60 * 1000);
  const first = new Date(instance.periodStart);
  if (last.getTime() <= first.getTime()) return fmt(instance.periodStart);
  return `${fmt(instance.periodStart)} to ${fmt(last.toISOString())}`;
};

const formatDateShort = (iso: string) => DATE_SHORT_FMT.format(new Date(iso));

export const formatDateTime = (iso: string) => {
  const date = new Date(iso);
  return `${DATE_LOCAL_FMT.format(date)} · ${TIME_LOCAL_FMT.format(date)}`;
};

export const formatTimeOnly = (iso: string) => TIME_LOCAL_FMT.format(new Date(iso));

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

export const VERIFICATION_STATUS_LABEL: Record<ChecklistVerificationStatus, string> = {
  NOT_SUBMITTED: 'Not submitted',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED: 'Verified',
  REJECTED: 'Sent back',
};

export const VERIFICATION_CHIP: Record<ChecklistVerificationStatus, { icon: LucideIcon; tone: string }> = {
  NOT_SUBMITTED: { icon: CircleDashed, tone: 'bg-text-light' },
  PENDING_APPROVAL: { icon: Eye, tone: 'bg-primary-600' },
  APPROVED: { icon: ShieldCheck, tone: 'bg-success' },
  REJECTED: { icon: ShieldX, tone: 'bg-danger' },
};

const verificationChipFor = (status: ChecklistVerificationStatus, isComplete: boolean): { icon: LucideIcon; tone: string; label: string } => {
  if (isComplete && status === 'NOT_SUBMITTED') return { icon: Send, tone: 'bg-warning', label: 'Ready to submit' };
  if (isComplete && status === 'REJECTED') return { icon: Send, tone: 'bg-warning', label: 'Fixed, submit again' };
  return { ...VERIFICATION_CHIP[status], label: VERIFICATION_STATUS_LABEL[status] };
};

export const rateWord = (rate: number | null | undefined) => (rate === null || rate === undefined ? 'No data' : rate >= 80 ? 'Good' : rate >= 50 ? 'Fair' : 'Low');

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

export const smallRateToneClass = (rate: number) => {
  if (rate >= 80) return 'text-success';
  if (rate >= 50) return 'text-text-secondary';
  return 'text-danger';
};

export const smallInverseRateToneClass = (rate: number) => {
  if (rate <= 20) return 'text-success';
  if (rate <= 50) return 'text-text-secondary';
  return 'text-danger';
};

export const instanceProgressToneClass = (overdue: boolean, isComplete: boolean) => {
  if (isComplete) return 'text-success';
  if (overdue) return 'text-danger';
  return 'text-primary-600 dark:text-primary-400';
};

type InstanceWindow = {
  periodStart: string;
  periodEnd: string;
  opensTime: string | null;
  cutoffTime: string | null;
  lateUntilTime?: string | null;
};

export const ORG_TZ_OFFSET_MS = 330 * 60_000;

export const orgDayKey = (ms: number): string => new Date(ms + ORG_TZ_OFFSET_MS).toISOString().slice(0, 10);

export const orgWeekday = (ms: number = Date.now()): number => new Date(ms + ORG_TZ_OFFSET_MS).getUTCDay();

export const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;

export const todayPeriodBoundIso = (): string => {
  const local = new Date(Date.now() + ORG_TZ_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())).toISOString();
};

const instanceOpensAt = (instance: Pick<InstanceWindow, 'periodStart' | 'opensTime'>): number | null => {
  const [hours, minutes] = instance.opensTime ? instance.opensTime.split(':').map(Number) : [0, 0];
  const start = new Date(instance.periodStart);
  return Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), hours, minutes, 0, 0) - ORG_TZ_OFFSET_MS;
};

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

const toMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

export const instanceClosing = (instance: InstanceWindow): number => {
  const deadline = instanceDeadline(instance);
  if (!instance.lateUntilTime || !instance.cutoffTime) return deadline;
  const extra = toMinutes(instance.lateUntilTime) - toMinutes(instance.cutoffTime);
  return extra > 0 ? deadline + extra * 60_000 : deadline;
};

export const isInstanceInLateWindow = (instance: InstanceWindow, isComplete: boolean, now: number = Date.now()): boolean =>
  !!instance.lateUntilTime && !isComplete && instanceDeadline(instance) <= now && now < instanceClosing(instance);

export const formatClockTime = (time: string): string => {
  const [hours, minutes] = time.split(':').map(Number);
  return `${hours % 12 === 0 ? 12 : hours % 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
};

export const formatCountdown = (ms: number): string => {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
};

export const formatDeadlineTime = (instance: InstanceWindow): string | null => {
  if (!instance.cutoffTime) return null;
  return DEADLINE_FMT.format(new Date(instanceDeadline(instance) + ORG_TZ_OFFSET_MS));
};

export const isInstanceOverdue = (instance: InstanceWindow, isComplete: boolean) =>
  !isComplete && instanceDeadline(instance) < Date.now();

export const isInstanceNotYetOpen = (instance: Pick<InstanceWindow, 'periodStart' | 'opensTime'>) => {
  const opensAt = instanceOpensAt(instance);
  return opensAt != null && Date.now() < opensAt;
};

type EndableInstance = InstanceWindow & {
  recurrence: ChecklistRecurrence;
  verificationStatus: ChecklistVerificationStatus;
  items: Pick<ChecklistInstanceItem, 'isDone'>[];
};

export const instanceStartOfOrgDay = (now: number = Date.now()): number => {
  const local = new Date(now + ORG_TZ_OFFSET_MS);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - ORG_TZ_OFFSET_MS;
};

export const instanceOpensOnLaterDay = (instance: Pick<InstanceWindow, 'periodStart' | 'opensTime'>, now: number = Date.now()): string | null => {
  const opensAt = instanceOpensAt(instance);
  if (opensAt == null || opensAt <= now) return null;
  if (orgDayKey(opensAt) === orgDayKey(now)) return null;
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(opensAt + ORG_TZ_OFFSET_MS));
};

const DONE_VISIBLE_DAYS = 3;

export const isInstanceDoneRecently = (
  instance: { recurrence: ChecklistRecurrence; items: Pick<ChecklistInstanceItem, 'isDone'>[]; completedFirstAt?: string | null },
  now: number = Date.now(),
): boolean => {
  if (instance.recurrence === 'DAILY' || instance.recurrence === 'ONE_TIME') return false;
  if (!instance.completedFirstAt || instance.items.length === 0 || !instance.items.every((i) => i.isDone)) return false;
  return now - new Date(instance.completedFirstAt).getTime() <= DONE_VISIBLE_DAYS * 24 * 60 * 60_000;
};

export const isInstanceEnded = (instance: EndableInstance, now: number = Date.now()): boolean => {
  if (instance.recurrence === 'ONE_TIME') return false;
  if (instance.verificationStatus === 'REJECTED') return false;
  if (instance.items.length > 0 && instance.items.every((i) => i.isDone)) return false;
  return instanceClosing(instance) <= now;
};

export const isInstanceEndedToday = (instance: EndableInstance, now: number = Date.now()): boolean =>
  isInstanceEnded(instance, now) && instanceClosing(instance) >= instanceStartOfOrgDay(now);

const END_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const describeInstanceEnd = (deadlineMs: number): string => {
  const local = new Date(deadlineMs + ORG_TZ_OFFSET_MS);
  const h = local.getUTCHours();
  const m = local.getUTCMinutes();
  if (h === 0 && m === 0) {
    const lastDay = new Date(local.getTime() - 24 * 60 * 60_000);
    return `the end of ${lastDay.getUTCDate()} ${END_MONTHS[lastDay.getUTCMonth()]}`;
  }
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'} on ${local.getUTCDate()} ${END_MONTHS[local.getUTCMonth()]}`;
};

export const describeDueBy = (deadlineMs: number, now: number = Date.now()): string => {
  const local = new Date(deadlineMs + ORG_TZ_OFFSET_MS);
  const h = local.getUTCHours();
  const m = local.getUTCMinutes();
  const atMidnight = h === 0 && m === 0;
  const dayMs = atMidnight ? deadlineMs - 60_000 : deadlineMs;
  const day = new Date(dayMs + ORG_TZ_OFFSET_MS);
  const isToday = orgDayKey(dayMs) === orgDayKey(now);
  const dayLabel = `${day.getUTCDate()} ${END_MONTHS[day.getUTCMonth()]}`;
  if (atMidnight) return isToday ? 'Due by end of today' : `Due by end of ${dayLabel}`;
  const clock = `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  return isToday ? `Due by ${clock}` : `Due by ${clock}, ${dayLabel}`;
};

export type InstanceView = {
  done: number;
  total: number;
  progress: number;
  isComplete: boolean;
  overdue: boolean;
  chipStatus: Extract<StatusChipStatus, 'completed' | 'overdue' | 'due'>;
  progressStatus: InstanceProgressStatus;
  compliance: number | null;
  scored: number;
  good: number;
  verification: { icon: LucideIcon; tone: string; label: string };
  deadlineTime: string | null;
  doneLate: boolean;
  inLateWindow: boolean;
  lateUntil: string | null;
  closed: boolean;
  closedAt: string | null;
  opensOn: string | null;
};

type ViewableInstance = InstanceWindow & { items: ChecklistInstanceItem[]; verificationStatus: ChecklistVerificationStatus; completedFirstAt?: string | null };

export const getInstanceView = (instance: ViewableInstance): InstanceView => {
  const scores = runScores(instance.items);
  const isComplete = instance.items.length > 0 && instance.items.every(i => i.isDone || i.isNotApplicable);
  const overdue = isInstanceOverdue(instance, isComplete);
  const closed = !isComplete
    && instance.verificationStatus !== 'REJECTED'
    && (instance as { recurrence?: string }).recurrence !== 'ONE_TIME'
    && instanceClosing(instance) <= Date.now();
  return {
    done: scores.done,
    total: scores.total,
    progress: scores.completion,
    isComplete,
    overdue,
    chipStatus: isComplete ? 'completed' : overdue ? 'overdue' : 'due',
    progressStatus: isComplete ? 'COMPLETED' : scores.done > 0 ? 'IN_PROGRESS' : 'TODO',
    compliance: scores.compliance,
    scored: scores.scored,
    good: scores.good,
    verification: verificationChipFor(instance.verificationStatus, isComplete),
    deadlineTime: formatDeadlineTime(instance),
    doneLate: isComplete && !!instance.completedFirstAt && new Date(instance.completedFirstAt).getTime() > instanceDeadline(instance),
    inLateWindow: isInstanceInLateWindow(instance, isComplete),
    lateUntil: instance.lateUntilTime ? formatClockTime(instance.lateUntilTime) : null,
    closed,
    closedAt: closed ? DEADLINE_FMT.format(new Date(instanceClosing(instance) + ORG_TZ_OFFSET_MS)) : null,
    opensOn: instanceOpensOnLaterDay(instance),
  };
};

type FlaggableItem = Pick<ChecklistInstanceItem, 'itemType' | 'booleanAnswer' | 'yesActions' | 'noActions'>;

const isGatedBooleanItem = (item: FlaggableItem) => {
  if (item.itemType !== 'YES_NO' && item.itemType !== 'PASS_FAIL') return false;
  const noCount = item.noActions?.length ?? 0;
  const yesCount = item.yesActions?.length ?? 0;
  const noGated = noCount > 0 && yesCount === 0;
  const yesGated = yesCount > 0 && noCount === 0;
  return noGated || yesGated;
};

export const isFlaggedAnswer = (item: FlaggableItem) => {
  if (!isGatedBooleanItem(item)) return false;
  if (item.booleanAnswer === 'NO') return (item.noActions?.length ?? 0) > 0;
  if (item.booleanAnswer === 'YES') return (item.yesActions?.length ?? 0) > 0;
  return false;
};

export const complianceToneClass = (percent: number): string =>
  percent >= 90 ? 'text-success' : percent >= 70 ? 'text-warning' : 'text-danger';
