export type CardAccent = 'blue' | 'sky' | 'green' | 'red' | 'violet';

const GOLD_BAR = 'border-t-2 border-t-gold';

export const CARD_TOP_BAR: Record<CardAccent, string> = {
  blue: GOLD_BAR,
  sky: GOLD_BAR,
  green: GOLD_BAR,
  red: 'border-t-2 border-t-vivid-red',
  violet: GOLD_BAR,
};

const HEAD_TINT = 'bg-primary-800/[0.03] dark:bg-primary-300/[0.05]';

export const CARD_HEAD_TINT: Record<CardAccent, string> = {
  blue: HEAD_TINT,
  sky: HEAD_TINT,
  green: HEAD_TINT,
  red: 'bg-vivid-red/5',
  violet: HEAD_TINT,
};
