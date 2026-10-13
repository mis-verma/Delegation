import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScoreChipProps {
  label: string;
  icon?: LucideIcon;
  /** Neutral by default. Only success and danger change the text colour; the surface never changes. */
  tone?: 'neutral' | 'success' | 'danger';
  title?: string;
  className?: string;
}

const TONE = { neutral: 'text-text-secondary', success: 'text-success', danger: 'text-danger' } as const;

/**
 * The one chip for Late, Not done, Open, Shared, Inactive, Left, Top and Needs attention: a neutral surface
 * with a solid border and an optional icon. Colour is carried by the text only, and only for success and
 * danger, so a row of chips never turns into a row of coloured badges.
 */
export const ScoreChip = ({ label, icon: Icon, tone = 'neutral', title, className }: ScoreChipProps) => (
  <span
    title={title}
    className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-border bg-surface-hover px-1.5 py-0.5 t-meta font-display font-semibold', TONE[tone], className)}
  >
    {Icon && <Icon className="size-3 shrink-0" aria-hidden="true" />}
    {label}
  </span>
);
