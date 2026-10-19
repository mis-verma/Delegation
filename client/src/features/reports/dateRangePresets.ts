import { endOfDay } from '../../lib/dateRange';

export type ReportPreset = 'daily' | 'weekly' | 'monthly' | 'lastMonth' | 'quarterly' | 'yearly';

export const PRESET_LABELS: Record<ReportPreset, string> = {
  daily: 'Today',
  weekly: 'This Week',
  monthly: 'This Month',
  lastMonth: 'Last Month',
  quarterly: 'This Quarter',
  yearly: 'This Year',
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const startOfWeek = (d: Date) => {
  const diffToMonday = (d.getDay() + 6) % 7;
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() - diffToMonday));
};

const PRESET_START: Record<ReportPreset, (now: Date) => Date> = {
  daily: (now) => startOfDay(now),
  weekly: (now) => startOfWeek(now),
  monthly: (now) => new Date(now.getFullYear(), now.getMonth(), 1),
  lastMonth: (now) => new Date(now.getFullYear(), now.getMonth() - 1, 1),
  quarterly: (now) => new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1),
  yearly: (now) => new Date(now.getFullYear(), 0, 1),
};

const PRESET_END: Record<ReportPreset, (now: Date) => Date> = {
  daily: (now) => now,
  weekly: (now) => now,
  monthly: (now) => now,
  lastMonth: (now) => new Date(now.getFullYear(), now.getMonth(), 0),
  quarterly: (now) => now,
  yearly: (now) => now,
};

export const computeRange = (preset: ReportPreset, now: Date): { from: string; to: string } => ({
  from: PRESET_START[preset](now).toISOString(),
  to: endOfDay(PRESET_END[preset](now)).toISOString(),
});
