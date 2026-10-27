import { rateTone, type RateTone } from './dashboardDisplay';

export const TONE_TEXT: Record<RateTone, string> = { success: 'text-vivid-green-text', warning: 'text-vivid-sky-text', danger: 'text-vivid-red-text', neutral: 'text-text-muted' };
export const TONE_BAR: Record<RateTone, string> = { success: 'bg-vivid-green', warning: 'bg-vivid-sky', danger: 'bg-vivid-red', neutral: 'bg-border-hover' };
export const TONE_WORD: Record<RateTone, string> = { success: 'Good', warning: 'Fair', danger: 'Low', neutral: '' };
export const TONE_BG: Record<RateTone, string> = { success: 'bg-vivid-green', warning: 'bg-vivid-sky', danger: 'bg-vivid-red', neutral: 'bg-text-muted' };
export const TONE_SOFT: Record<RateTone, string> = {
  success: 'border-vivid-green/40 from-vivid-green/12',
  warning: 'border-vivid-sky/40 from-vivid-sky/12',
  danger: 'border-vivid-red/40 from-vivid-red/12',
  neutral: 'border-border/60 from-surface-hover/50',
};
export const TONE_COLOR: Record<RateTone, string> = {
  success: 'var(--color-vivid-green)',
  warning: 'var(--color-vivid-sky)',
  danger: 'var(--color-vivid-red)',
  neutral: 'var(--color-vivid-blue)',
};
export const TONE_SOLID: Record<RateTone, string> = { success: 'bg-vivid-green', warning: 'bg-vivid-sky', danger: 'bg-vivid-red', neutral: 'bg-vivid-blue' };

export const toneOf = (v: number | null): RateTone => (v === null ? 'neutral' : rateTone(v, Number.MAX_SAFE_INTEGER));
