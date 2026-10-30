export type CardAccent = 'blue' | 'sky' | 'green' | 'red' | 'violet';

export const CARD_TOP_BAR: Record<CardAccent, string> = {
  blue: 'border-t-[3px] border-t-vivid-blue',
  sky: 'border-t-[3px] border-t-vivid-sky',
  green: 'border-t-[3px] border-t-vivid-green',
  red: 'border-t-[3px] border-t-vivid-red',
  violet: 'border-t-[3px] border-t-coral-500',
};

export const CARD_HEAD_TINT: Record<CardAccent, string> = {
  blue: 'bg-vivid-blue/5',
  sky: 'bg-vivid-sky/5',
  green: 'bg-vivid-green/5',
  red: 'bg-vivid-red/5',
  violet: 'bg-coral-500/5',
};
