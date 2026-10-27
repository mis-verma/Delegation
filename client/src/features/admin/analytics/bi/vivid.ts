import type { RateTone } from '../../../dashboard/dashboardDisplay';
import { toneOf } from '../../../dashboard/scoreTone';

export { toneOf };

export const TONE_BAR: Record<RateTone, string> = {
  success: 'bg-vivid-green',
  warning: 'bg-vivid-sky',
  danger: 'bg-vivid-red',
  neutral: 'bg-border-hover',
};

export const TONE_TEXT: Record<RateTone, string> = {
  success: 'text-vivid-green-text',
  warning: 'text-vivid-sky-text',
  danger: 'text-vivid-red-text',
  neutral: 'text-text-muted',
};

export const TONE_COLOR: Record<RateTone, string> = {
  success: 'var(--color-vivid-green)',
  warning: 'var(--color-vivid-sky)',
  danger: 'var(--color-vivid-red)',
  neutral: 'var(--color-vivid-blue)',
};

export const TONE_SOLID: Record<RateTone, string> = {
  success: 'bg-vivid-green',
  warning: 'bg-vivid-sky',
  danger: 'bg-vivid-red',
  neutral: 'bg-vivid-blue',
};

export const TONE_WORD: Record<RateTone, string> = { success: 'Good', warning: 'Fair', danger: 'Low', neutral: '' };
