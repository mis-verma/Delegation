import type { MatrixBucket, MatrixPeriod } from '../../../../api/scores';
import { spanDays } from '../analyticsDisplay';

export type BiPeriodChoice = 'auto' | MatrixPeriod;

const MAX_DAY_SPAN = 31;
const MAX_WEEK_SPAN = 162;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const autoPeriod = (from: string, to: string): MatrixPeriod => {
  const span = spanDays(from, to);
  return span <= MAX_DAY_SPAN ? 'day' : span <= MAX_WEEK_SPAN ? 'week' : 'month';
};

export const periodAllowed = (period: MatrixPeriod, from: string, to: string): boolean => {
  const span = spanDays(from, to);
  if (period === 'day') return span <= MAX_DAY_SPAN;
  if (period === 'week') return span <= MAX_WEEK_SPAN;
  return true;
};

export const effectivePeriod = (choice: BiPeriodChoice, from: string, to: string): MatrixPeriod =>
  choice !== 'auto' && periodAllowed(choice, from, to) ? choice : autoPeriod(from, to);

const parts = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return { y, m: (m ?? 1) - 1, d: d ?? 1 };
};

export const dayLabel = (day: string) => {
  const { m, d } = parts(day);
  return `${d} ${MONTHS[m] ?? ''}`;
};

export const bucketLabel = (period: MatrixPeriod, b: MatrixBucket): string => {
  if (period === 'month') {
    const { y, m } = parts(b.from);
    return `${MONTHS[m] ?? ''} ${String(y).slice(2)}`;
  }
  return dayLabel(b.from);
};

export const bucketShortLabel = (period: MatrixPeriod, b: MatrixBucket): string => {
  if (period === 'day') return String(parts(b.from).d);
  if (period === 'month') return MONTHS[parts(b.from).m] ?? '';
  return dayLabel(b.from);
};

export const bucketTitle = (period: MatrixPeriod, b: MatrixBucket): string => {
  if (period === 'day' || b.from === b.to) return dayLabel(b.from);
  return `${dayLabel(b.from)} to ${dayLabel(b.to)}`;
};

export const PERIOD_NOUN: Record<MatrixPeriod, string> = { day: 'day', week: 'week', month: 'month' };

const DAY_MS = 86_400_000;
const ms = (day: string) => Date.parse(`${day}T00:00:00Z`);
const ymd = (n: number) => new Date(n).toISOString().slice(0, 10);

export const previousWindow = (from: string, to: string): { from: string; to: string } => {
  const span = Math.round((ms(to) - ms(from)) / DAY_MS) + 1;
  return { from: ymd(ms(from) - span * DAY_MS), to: ymd(ms(from) - DAY_MS) };
};
