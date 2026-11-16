import { formatWeekdays, ordinalDay, weekdayShortName } from '../../../components';
import type { ChecklistDefinition } from '../../../api/checklistDefinitions';
import { RECURRENCE_REGISTRY, type PickerKind } from '../recurrenceRegistry';

const PICKED_FORMAT: Record<PickerKind, (n: number) => string> = {
  weekdays: weekdayShortName,
  monthDays: ordinalDay,
};

type Schedule = Pick<ChecklistDefinition, 'recurrence' | 'activeWeekdays' | 'occurrenceDays'>;

const detailOf = (d: Schedule): string | null => {
  const { picker } = RECURRENCE_REGISTRY[d.recurrence];
  if (picker) return [...(d.occurrenceDays ?? [])].sort((a, b) => a - b).map(PICKED_FORMAT[picker]).join(' & ') || null;
  return d.recurrence === 'DAILY' ? formatWeekdays(d.activeWeekdays) : null;
};

export const scheduleDetail = detailOf;

export const scheduleLabel = (d: Schedule): string => [RECURRENCE_REGISTRY[d.recurrence].label, detailOf(d)].filter(Boolean).join(' · ');
