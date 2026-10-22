import { rateTone, type RateTone } from './dashboardDisplay';

export const TONE_TEXT: Record<RateTone, string> = { success: 'text-success', warning: 'text-warning', danger: 'text-danger', neutral: 'text-text-muted' };
export const TONE_BAR: Record<RateTone, string> = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', neutral: 'bg-border-hover' };
export const TONE_WORD: Record<RateTone, string> = { success: 'Good', warning: 'Fair', danger: 'Low', neutral: '' };
export const TONE_BG: Record<RateTone, string> = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', neutral: 'bg-text-muted' };
export const TONE_SOFT: Record<RateTone, string> = {
  success: 'border-success/30 from-success/12',
  warning: 'border-warning/30 from-warning/12',
  danger: 'border-danger/30 from-danger/12',
  neutral: 'border-border/60 from-surface-hover/50',
};
export const TONE_COLOR: Record<RateTone, string> = {
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
  neutral: 'var(--color-primary-500)',
};

export const toneOf = (v: number | null): RateTone => (v === null ? 'neutral' : rateTone(v, Number.MAX_SAFE_INTEGER));
