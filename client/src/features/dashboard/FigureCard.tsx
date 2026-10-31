import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { CircleHelp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CountUp } from '../../components/countUp';
import { Skeleton } from '../../components/skeleton';

export type FigureTone = 'good' | 'fair' | 'bad' | 'plain';

const TEXT: Record<FigureTone, string> = {
  good: 'text-success',
  fair: 'text-warning',
  bad: 'text-danger',
  plain: 'text-text',
};

const BAR: Record<FigureTone, string> = {
  good: 'bg-success',
  fair: 'bg-warning',
  bad: 'bg-danger',
  plain: 'bg-border-hover',
};

export type FigureTint = 'blue' | 'sky' | 'green' | 'red';

const TINT: Record<FigureTint, string> = {
  blue: 'border-vivid-blue/40 bg-vivid-blue/12',
  sky: 'border-vivid-sky/40 bg-vivid-sky/12',
  green: 'border-vivid-green/40 bg-vivid-green/12',
  red: 'border-vivid-red/40 bg-vivid-red/12',
};

const TINT_SELECTED: Record<FigureTint, string> = {
  blue: 'border-vivid-blue/70 bg-vivid-blue/12 ring-2 ring-black/5 dark:ring-white/10',
  sky: 'border-vivid-sky/70 bg-vivid-sky/12 ring-2 ring-black/5 dark:ring-white/10',
  green: 'border-vivid-green/70 bg-vivid-green/12 ring-2 ring-black/5 dark:ring-white/10',
  red: 'border-vivid-red/70 bg-vivid-red/12 ring-2 ring-black/5 dark:ring-white/10',
};

const BOX = 'flex min-w-0 flex-col gap-1.5 rounded-lg border border-border/50 bg-surface-hover/30 p-2.5 text-left';
const ACTION = 'w-full cursor-pointer outline-none transition-colors duration-150 hover:border-border-hover active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40';

interface FigureCardProps {
  label: string;
  short?: string;
  help: string;
  value: number | null;
  tone: FigureTone;
  bar: number | null;
  loading: boolean;
  text?: string;
  format?: (n: number) => string;
  decimals?: number;
  to?: string;
  onClick?: () => void;
  selected?: boolean;
  compact?: boolean;
  tint?: FigureTint;
  error?: boolean;
  onRetry?: () => void;
}

export const FigureCard = ({ label, short, help, value, tone, bar, loading, text, format, decimals = 0, to, onClick, selected, compact = false, tint, error = false, onRetry }: FigureCardProps) => {
  const failed = error && !loading;
  const shownTone: FigureTone = failed ? 'plain' : tone;
  const hint = failed ? "Couldn't load. Tap to try again." : help;
  const body: ReactNode = (
    <>
      <span className="flex min-w-0 items-center gap-x-1 whitespace-nowrap t-meta text-text-muted">
        <span aria-hidden="true" className={cn('hidden size-2 shrink-0 rounded-full', compact && 'max-sm:inline-block', loading ? 'bg-border' : BAR[shownTone])} />
        {short ? (
          <>
            <span className="min-w-0 truncate @[22rem]:hidden">{short}</span>
            <span className="hidden min-w-0 truncate @[22rem]:inline">{label}</span>
          </>
        ) : (
          <span className="min-w-0 truncate">{label}</span>
        )}
        <span title={hint} className={cn('inline-flex shrink-0 text-text-light', compact && 'max-sm:hidden')}>
          <CircleHelp className="size-3.5" aria-hidden="true" />
          <span className="sr-only">{hint}</span>
        </span>
      </span>
      <span className="flex min-h-7 items-center">
        {loading ? (
          <Skeleton className="h-6 w-12" />
        ) : (
          <span className={cn('t-stat font-display font-bold leading-tight tabular-nums', failed || (value === null && !text) ? 'text-text-light' : TEXT[shownTone])}>
            {failed ? '-' : (text ?? (value === null ? '-' : <CountUp value={value} decimals={decimals} format={format} fromZero />))}
          </span>
        )}
      </span>
      <span className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-hover', compact && 'max-sm:hidden')} aria-hidden="true">
        <span
          className={cn('block h-full rounded-full transition-[width] duration-500 ease-out', value === null || failed ? 'bg-border-hover' : BAR[shownTone])}
          style={{ width: `${loading || failed || bar === null ? 0 : Math.max(4, Math.min(100, bar))}%` }}
        />
      </span>
    </>
  );

  const tinted = !!tint && !failed && !loading && value !== null && value > 0;
  const box = cn(BOX, compact && 'max-sm:gap-0.5 max-sm:p-2', tinted && tint && (selected ? TINT_SELECTED[tint] : TINT[tint]));
  if (failed && onRetry) {
    return <button type="button" onClick={onRetry} aria-label={`${label}, couldn't load. Tap to try again`} className={cn(box, ACTION, 'border-danger/30')}>{body}</button>;
  }
  if (to) return <Link to={to} viewTransition aria-label={label} className={cn(box, ACTION)}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} aria-label={label} aria-pressed={selected} className={cn(box, ACTION, selected && !tinted && 'border-primary-500/60 bg-primary-500/8')}>{body}</button>;
  return <div className={box}>{body}</div>;
};
