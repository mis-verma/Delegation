export type CardAccent = 'blue' | 'sky' | 'green' | 'red' | 'violet';

const alertOnly = (alert: string): Record<CardAccent, string> => ({ blue: '', sky: '', green: '', red: alert, violet: '' });

export const CARD_TOP_BAR = alertOnly('border-t-2 border-t-vivid-red');

export const CARD_HEAD_TINT = alertOnly('bg-vivid-red/5');
