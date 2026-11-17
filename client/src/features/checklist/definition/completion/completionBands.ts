export type CompletionBand = 'low' | 'mid' | 'high';

export const MID_FROM = 40;
export const HIGH_FROM = 80;

export const bandOf = (percent: number): CompletionBand => {
  if (percent >= HIGH_FROM) return 'high';
  return percent >= MID_FROM ? 'mid' : 'low';
};

export const BAND_COLOR: Record<CompletionBand, string> = {
  low: 'var(--color-danger)',
  mid: 'var(--color-primary-600)',
  high: 'var(--color-success)',
};

export const BAND_TEXT: Record<CompletionBand, string> = {
  low: 'text-danger',
  mid: 'text-primary-700 dark:text-primary-300',
  high: 'text-success',
};

export const BAND_DOT: Record<CompletionBand, string> = {
  low: 'bg-danger',
  mid: 'bg-primary-600',
  high: 'bg-success',
};

export const BAND_LABEL: Record<CompletionBand, string> = {
  low: `Behind, under ${MID_FROM}%`,
  mid: 'Getting there',
  high: `On top of it, ${HIGH_FROM}% and up`,
};

export const BAND_ORDER: readonly CompletionBand[] = ['low', 'mid', 'high'];

export const percentOf = (done: number, total: number): number => (total > 0 ? Math.round((done / total) * 100) : 0);
