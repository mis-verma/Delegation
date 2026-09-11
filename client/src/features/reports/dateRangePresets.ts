import { endOfDay } from '../../lib/dateRange';

export type ReportPreset = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export const PRESET_LABELS: Record<ReportPreset, string> = {
  daily: 'Today',
  weekly: 'This Week',
  monthly: 'This Month',
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
  quarterly: (now) => new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1),
  yearly: (now) => new Date(now.getFullYear(), 0, 1),
};

// Computes the [from, to] ISO range for a preset, anchored to `now` (today through the end of
// today) — e.g. "This Quarter" run on any day in Q3 returns [Jul 1, "right now"].
export const computeRange = (preset: ReportPreset, now: Date): { from: string; to: string } => ({
  from: PRESET_START[preset](now).toISOString(),
  to: endOfDay(now).toISOString(),
});
