import type { ChecklistRecurrence } from '../../../../api/checklistDefinitions';

export const hasScheduleTimeMismatch = (opensTime: string, cutoffTime: string): boolean =>
  Boolean(opensTime && cutoffTime) && opensTime === cutoffTime;

export const isOvernightWindow = (opensTime: string, cutoffTime: string): boolean =>
  Boolean(opensTime && cutoffTime) && cutoffTime < opensTime;

export const canOfferLateWindow = (recurrence: ChecklistRecurrence, opensTime: string, cutoffTime: string): boolean =>
  (recurrence === 'DAILY' || recurrence === 'ONE_TIME') && !!cutoffTime && !isOvernightWindow(opensTime, cutoffTime);

export const lateWindowProblem = (recurrence: ChecklistRecurrence, opensTime: string, cutoffTime: string, lateUntilTime: string): string | null => {
  if (!lateUntilTime) return null;
  if (recurrence !== 'DAILY' && recurrence !== 'ONE_TIME') return 'A late window only works on daily or one-time checklists.';
  if (!cutoffTime) return 'Set a closing time before adding a late window.';
  if (isOvernightWindow(opensTime, cutoffTime)) return "A late window can't be used when the checklist closes after midnight.";
  if (lateUntilTime <= cutoffTime) return 'The late window must end after the closing time.';
  return null;
};
