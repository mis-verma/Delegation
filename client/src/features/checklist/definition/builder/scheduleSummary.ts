import type { ChecklistRecurrence } from '../../../../api/checklistDefinitions';
import { ordinalDay } from '../../../../components/monthDayPicker';
import { RECURRENCE_REGISTRY } from '../../recurrenceRegistry';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const parseDay = (value: string): Date | null => (value ? new Date(`${value}T00:00:00`) : null);

const ordinal = ordinalDay;

const shortDate = (d: Date) => `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;

export const clockLabel = (value: string): string => {
  const [h, m] = value.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

export const startDateHint = (recurrence: ChecklistRecurrence, startDate: string): string => {
  const date = parseDay(startDate);
  if (!date) return '';
  const weekday = WEEKDAY_NAMES[date.getDay()];
  if (recurrence === 'WEEKLY') return `Repeats every ${weekday}`;
  if (recurrence === 'TWICE_WEEKLY' || recurrence === 'TWICE_MONTHLY') return `Starts ${weekday}`;
  if (recurrence === 'MONTHLY' || recurrence === 'QUARTERLY') return `${weekday}. Repeats on the ${ordinal(date.getDate())}`;
  return weekday;
};

export const pickedLabel = (recurrence: ChecklistRecurrence, picked: readonly number[]): string =>
  [...picked].sort((a, b) => a - b).map((n) => (recurrence === 'TWICE_WEEKLY' ? WEEKDAY_NAMES[n] : ordinal(n))).join(' and ');

export const repeatSentence = (recurrence: ChecklistRecurrence, startDate: string, daysLabel: string, picked: readonly number[] = []): string => {
  if (recurrence === 'DAILY') return daysLabel === 'Every day' ? 'Every day' : `Runs ${daysLabel}`;
  const date = parseDay(startDate);
  if (!date) return recurrence === 'ONE_TIME' ? 'Pick the due date.' : 'Pick a start date to see when it runs.';
  const weekday = WEEKDAY_NAMES[date.getDay()];
  const from = `starting ${shortDate(date)}`;
  switch (recurrence) {
    case 'TWICE_WEEKLY':
      return picked.length === 2 ? `Every ${pickedLabel(recurrence, picked)}, ${from}` : 'Pick the two days of the week it runs.';
    case 'TWICE_MONTHLY':
      return picked.length === 2 ? `On the ${pickedLabel(recurrence, picked)} of every month, ${from}${picked.some((n) => n > 28) ? '. Shorter months use their last day' : ''}` : 'Pick the two dates of the month it runs.';
    case 'WEEKLY':
      return `Every ${weekday}, ${from}`;
    case 'MONTHLY':
      return `On the ${ordinal(date.getDate())} of every month, ${from}${date.getDate() > 28 ? '. Shorter months use their last day' : ''}`;
    case 'QUARTERLY':
      return `Every 3 months on the ${ordinal(date.getDate())}, ${from}`;
    case 'YEARLY':
      return `Every year on ${shortDate(date)}, ${from} ${date.getFullYear()}`;
    default:
      return `Once, on ${weekday} ${shortDate(date)} ${date.getFullYear()}`;
  }
};

export const windowSentence = (opensTime: string, cutoffTime: string, overnight: boolean): string => {
  if (!opensTime && !cutoffTime) return 'Open all day';
  if (opensTime && !cutoffTime) return `Opens at ${clockLabel(opensTime)}`;
  if (!opensTime) return `Closes at ${clockLabel(cutoffTime)}`;
  return `Open ${clockLabel(opensTime)} to ${clockLabel(cutoffTime)}${overnight ? ', closes the next morning' : ''}`;
};

export const earlySentence = (recurrence: ChecklistRecurrence): string | null => {
  const { leadDays, trailDays } = RECURRENCE_REGISTRY[recurrence];
  return leadDays === 0
    ? null
    : `Staff see each run ${leadDays} days before the date and can fill it from then. It is due at the end of that day, and stays on their list for ${trailDays} more days.`;
};
