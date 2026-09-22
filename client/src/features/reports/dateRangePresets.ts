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

// Monday-start week, matching the ISO week convention used elsewhere in this codebase
// (ticket.service.ts's tatReport groups by "%G-W%V", Mongo's ISO week format).
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

// Every preset but "Last Month" ends at "right now" — that one alone needs its own fixed end
// (the last day of the previous calendar month), so it gets its own map instead of a shared
// `endOfDay(now)` with a single special case buried in computeRange.
const PRESET_END: Record<ReportPreset, (now: Date) => Date> = {
  daily: (now) => now,
  weekly: (now) => now,
  monthly: (now) => now,
  lastMonth: (now) => new Date(now.getFullYear(), now.getMonth(), 0),
  quarterly: (now) => now,
  yearly: (now) => now,
};

// Computes the [from, to] ISO range for a preset, anchored to `now` — e.g. "This Quarter" run on
// any day in Q3 returns [Jul 1, "right now"], while "Last Month" always returns a closed range
// for the prior calendar month regardless of when it's run.
export const computeRange = (preset: ReportPreset, now: Date): { from: string; to: string } => ({
  from: PRESET_START[preset](now).toISOString(),
  to: endOfDay(PRESET_END[preset](now)).toISOString(),
});
