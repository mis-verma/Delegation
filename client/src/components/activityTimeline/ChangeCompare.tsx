import type { ReactNode } from 'react';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TONE, type ActivityTone } from './activityTones';

// The new value's tint, one per tone. Opacity tints, so they sit right on a light or a dark surface.
const NEW_VALUE: Record<ActivityTone, string> = {
  primary: 'bg-primary-500/12 text-primary-700 dark:text-primary-200',
  success: 'bg-success/12 text-success',
  info: 'bg-info/12 text-info',
  warning: 'bg-warning/12 text-warning',
  danger: 'bg-danger/12 text-danger',
  coral: 'bg-coral-500/12 text-coral-700 dark:text-coral-200',
  muted: 'bg-surface-hover text-text-secondary',
};

interface ChangeCompareProps {
  /** The old value. Left out when there was none (it was set for the first time). */
  from?: ReactNode;
  to: ReactNode;
  /** A coloured tile in front, e.g. a calendar for a date change. */
  icon?: LucideIcon;
  tone?: ActivityTone;
  /** A short note after the pair, such as "3 days later". */
  note?: ReactNode;
  noteTone?: ActivityTone;
  /** No border or background of its own: for a row that already sits inside a panel. */
  plain?: boolean;
}

/**
 * "Was → Now" as one small card: the old value stepped back and struck through, a round arrow, then the new value
 * in the colour of the change. Used for dates, priority and assignee in the Activity feed, and for date fields in
 * the full change log, so every before-and-after reads the same way.
 */
export const ChangeCompare = ({ from, to, icon: Icon, tone = 'primary', note, noteTone, plain = false }: ChangeCompareProps) => (
  <div className={cn('inline-flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-1.5', plain ? '' : 'rounded-xl border border-border/60 bg-surface p-1.5')}>
    {Icon && (
      <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg text-white', TONE[tone])} aria-hidden="true">
        <Icon size={14} strokeWidth={2.25} />
      </span>
    )}
    {from != null && (
      <>
        <span className="min-w-0 truncate text-xs font-display font-medium text-text-muted line-through decoration-text-light/70">{from}</span>
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-hover text-text-muted" aria-label="changed to">
          <ArrowRight size={11} strokeWidth={2.75} />
        </span>
      </>
    )}
    <span className={cn('min-w-0 truncate rounded-lg px-2 py-1 text-xs font-display font-bold', NEW_VALUE[tone])}>{to}</span>
    {note && <span className={cn('pr-1 text-xs font-display font-semibold', noteTone ? NEW_VALUE[noteTone].split(' ').filter((c) => c.startsWith('text-') || c.startsWith('dark:text-')).join(' ') : 'text-text-muted')}>{note}</span>}
  </div>
);
