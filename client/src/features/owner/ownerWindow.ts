import type { ExplorerModule, ExplorerRow } from '../../api/scores';

const DAY_MS = 86_400_000;
const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const spanDays = (from: string, to: string) => Math.round((dayMs(to) - dayMs(from)) / DAY_MS) + 1;

export const shiftDay = (day: string, delta: number) => ymd(dayMs(day) + delta * DAY_MS);

export type ComparePeriod = 'day' | 'week' | 'month';

export const likeForLikeBefore = (period: ComparePeriod, from: string, to: string) => {
  if (period === 'day' || period === 'week') {
    const before = { from: shiftDay(from, -7), to: shiftDay(to, -7) };
    return { ...before, days: spanDays(before.from, before.to) };
  }
  const start = new Date(dayMs(from));
  const prevFirst = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1);
  const prevLast = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0);
  const offset = Math.round((dayMs(to) - dayMs(from)) / DAY_MS);
  const before = { from: ymd(prevFirst), to: ymd(Math.min(prevFirst + offset * DAY_MS, prevLast)) };
  return { ...before, days: spanDays(before.from, before.to) };
};

export type OwnerFigure = ExplorerModule | 'all';

export const figureOf = (row: ExplorerRow | undefined, key: OwnerFigure): number | null => {
  if (!row) return null;
  if (key === 'all') return row.totalDue === 0 ? null : row.overall;
  return row[key].due === 0 ? null : row[key].score;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const shortDay = (day: string) => {
  const d = new Date(dayMs(day));
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
