import type { ExplorerModule, ExplorerRow } from '../../api/scores';

const DAY_MS = 86_400_000;
const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const spanDays = (from: string, to: string) => Math.round((dayMs(to) - dayMs(from)) / DAY_MS) + 1;

export const equalSpanBefore = (from: string, to: string) => {
  const days = spanDays(from, to);
  return { from: ymd(dayMs(from) - days * DAY_MS), to: ymd(dayMs(from) - DAY_MS), days };
};

export const shiftDay = (day: string, delta: number) => ymd(dayMs(day) + delta * DAY_MS);

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
