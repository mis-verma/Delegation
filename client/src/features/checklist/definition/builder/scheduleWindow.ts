import type { ChecklistRecurrence } from '../../../../api/checklistDefinitions';

export const END_OF_DAY_CUTOFF = '00:00';

export const hasScheduleTimeMismatch = (opensTime: string, cutoffTime: string): boolean =>
  Boolean(opensTime && cutoffTime) && opensTime === cutoffTime;

export const isOvernightWindow = (opensTime: string, cutoffTime: string): boolean =>
  Boolean(opensTime && cutoffTime) && cutoffTime !== END_OF_DAY_CUTOFF && cutoffTime < opensTime;

export const isTimedRecurrence = (recurrence: ChecklistRecurrence): boolean => recurrence === 'DAILY' || recurrence === 'ONE_TIME';

export const canOfferLateWindow = (recurrence: ChecklistRecurrence, opensTime: string, cutoffTime: string): boolean =>
  (recurrence === 'DAILY' || recurrence === 'ONE_TIME') && !!cutoffTime && cutoffTime !== END_OF_DAY_CUTOFF && !isOvernightWindow(opensTime, cutoffTime);

export const lateWindowProblem = (recurrence: ChecklistRecurrence, opensTime: string, cutoffTime: string, lateUntilTime: string): string | null => {
  if (!lateUntilTime) return null;
  if (recurrence !== 'DAILY' && recurrence !== 'ONE_TIME') return 'A late window only works on daily or one-time checklists.';
  if (!cutoffTime) return 'Set a closing time before adding a late window.';
  if (cutoffTime === END_OF_DAY_CUTOFF) return "A late window can't be used when the checklist closes at the end of the day.";
  if (isOvernightWindow(opensTime, cutoffTime)) return "A late window can't be used when the checklist closes after midnight.";
  if (lateUntilTime <= cutoffTime) return 'The late window must end after the closing time.';
  return null;
};

export const isDateBeforeToday = (date: string, now: Date = new Date()): boolean => {
  if (!date) return false;
  const pad = (n: number) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return date < today;
};
