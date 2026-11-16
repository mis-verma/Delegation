import type { ChecklistRecurrence } from '../../api/checklistDefinitions';

export type PickerKind = 'weekdays' | 'monthDays';

export interface RecurrenceSchema {
  label: string;
  description: string;
  leadDays: number;
  trailDays: number;
  picker?: PickerKind;
}

const EARLY_DAYS = 3;
const TRAIL_DAYS = 3;

export const RECURRENCE_REGISTRY: Record<ChecklistRecurrence, RecurrenceSchema> = {
  DAILY: { label: 'Daily', description: 'Every day, or the days you pick', leadDays: 0, trailDays: 0 },
  TWICE_WEEKLY: { label: 'Twice a week', description: 'Two weekdays every week, like Mon and Thu', leadDays: EARLY_DAYS, trailDays: TRAIL_DAYS, picker: 'weekdays' },
  WEEKLY: { label: 'Weekly', description: 'Same weekday every week', leadDays: EARLY_DAYS, trailDays: TRAIL_DAYS },
  TWICE_MONTHLY: { label: 'Twice a month', description: 'Two dates every month, like the 1st and 15th', leadDays: EARLY_DAYS, trailDays: TRAIL_DAYS, picker: 'monthDays' },
  MONTHLY: { label: 'Monthly', description: 'Same date every month', leadDays: EARLY_DAYS, trailDays: TRAIL_DAYS },
  QUARTERLY: { label: 'Quarterly', description: 'Every 3 months', leadDays: EARLY_DAYS, trailDays: TRAIL_DAYS },
  YEARLY: { label: 'Yearly', description: 'Once a year', leadDays: EARLY_DAYS, trailDays: TRAIL_DAYS },
  ONE_TIME: { label: 'One-time', description: 'A single run', leadDays: 0, trailDays: 0 },
};

export const RECURRENCE_ORDER = Object.keys(RECURRENCE_REGISTRY) as ChecklistRecurrence[];

export const PICKER_SIZE = 2;

export const RECURRENCE_LABEL = Object.fromEntries(
  RECURRENCE_ORDER.map((key) => [key, RECURRENCE_REGISTRY[key].label]),
) as Record<ChecklistRecurrence, string>;

const DAY_MS = 86_400_000;

export const leadMs = (recurrence: ChecklistRecurrence | undefined): number =>
  recurrence ? RECURRENCE_REGISTRY[recurrence].leadDays * DAY_MS : 0;

export const trailMs = (recurrence: ChecklistRecurrence): number => RECURRENCE_REGISTRY[recurrence].trailDays * DAY_MS;
