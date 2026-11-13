import { FAIR_FROM, GOOD_FROM } from '../../../lib/scoreBands';

export const formatCount = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1));

export const COUNT_HEAD_CLASS = 'w-32 min-w-32 px-3 py-2.5 text-right t-meta font-display font-semibold text-text-secondary whitespace-nowrap';
export const COUNT_CELL_CLASS = 'w-32 min-w-32 px-3 py-2.5 text-right align-middle';

export const countText = (done: number | undefined, due: number | undefined) =>
  done === undefined || due === undefined || due === 0 ? '' : `${formatCount(done)}/${formatCount(due)}`;

export type FillBand = 'good' | 'fair' | 'low';

export const fillBand = (pct: number): FillBand => (pct >= GOOD_FROM ? 'good' : pct >= FAIR_FROM ? 'fair' : 'low');

export const FILL_TONE: Record<FillBand, { text: string; bar: string }> = {
  good: { text: 'text-vivid-green-text', bar: 'bg-vivid-green' },
  fair: { text: 'text-vivid-sky-text', bar: 'bg-vivid-sky' },
  low: { text: 'text-vivid-red-text', bar: 'bg-vivid-red' },
};

export const fillTone = (pct: number) => FILL_TONE[fillBand(pct)];
