import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { CountUp } from '../../components/countUp';
import { Skeleton } from '../../components/skeleton';
import { HintPopover } from '../scores/HowCalculated';
import { FIGURE_BAR, FIGURE_TEXT } from './scoreTone';
import { STAT_BAR_SMALL, STAT_BOX, STAT_FIGURE, STAT_PHONE_CENTER, STAT_ROW_PHONE_CENTER, STAT_SURFACE_SELECTED } from '../../components/statSurface';
import { useStatCountFormat } from '../../lib/statCount';

export type FigureTone = 'good' | 'fair' | 'bad' | 'plain';

const INTERACTIVE = 'relative transition-colors duration-150 ease-out hover:bg-surface-hover active:scale-[0.985]';
const OVERLAY = 'absolute inset-0 rounded-2xl outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-primary-500/40';

interface FigureCardProps {
  label: string;
  short?: string;
  help?: string;
  value: number | null;
  tone: FigureTone;
  bar?: number | null;
  loading: boolean;
  text?: string;
  caption?: ReactNode;
  format?: (n: number) => string;
  decimals?: number;
  to?: string;
  onClick?: () => void;
  selected?: boolean;
  compact?: boolean;
  error?: boolean;
  onRetry?: () => void;
}

export const FigureCard = ({ label, short, help, value, tone, bar, loading, text, caption, format, decimals = 0, to, onClick, selected, compact = false, error = false, onRetry }: FigureCardProps) => {
  const helpId = useId();
  const formatCount = useStatCountFormat();
  const failed = error && !loading;
  const shownTone: FigureTone = failed ? 'plain' : tone;
  const hint = failed ? "Couldn't load. Tap to try again." : help;
  const describedBy = hint ? helpId : undefined;
  const valueText = loading ? 'loading' : failed ? "couldn't load" : text ?? (value === null ? 'no figure yet' : format ? format(value) : value.toFixed(decimals));
  const spoken = `${label}: ${valueText}`;

  const overlay: ReactNode = failed && onRetry ? (
    <button type="button" onClick={onRetry} aria-label={`${label}, couldn't load. Tap to try again`} className={OVERLAY} />
  ) : to ? (
    <Link to={to} viewTransition aria-label={spoken} aria-describedby={describedBy} className={OVERLAY} />
  ) : onClick && !loading ? (
    <button type="button" onClick={onClick} aria-label={spoken} aria-describedby={describedBy} aria-pressed={selected} className={OVERLAY} />
  ) : null;
  const interactive = overlay !== null;

  return (
    <div
      role={interactive ? undefined : 'group'}
      aria-label={interactive ? undefined : label}
      aria-describedby={interactive ? undefined : describedBy}
      className={cn(
        STAT_BOX,
        STAT_PHONE_CENTER,
        compact && 'max-sm:gap-0.5 max-sm:p-2',
        interactive && INTERACTIVE,
        failed && onRetry && 'ring-1 ring-danger/30',
        selected && !failed && cn(STAT_SURFACE_SELECTED, STAT_BAR_SMALL),
      )}
    >
      {overlay}
      <span className={cn('relative flex min-w-0 max-w-full items-center gap-x-1 whitespace-nowrap t-meta text-text-muted', STAT_ROW_PHONE_CENTER, interactive && 'pointer-events-none')}>
        <span aria-hidden="true" className={cn('hidden size-2 shrink-0 rounded-full', compact && 'max-sm:inline-block', loading ? 'bg-border' : FIGURE_BAR[shownTone])} />
        {short ? (
          <>
            <span className="min-w-0 truncate sm:@[22rem]:hidden">{short}</span>
            <span className="hidden min-w-0 truncate sm:@[22rem]:inline">{label}</span>
          </>
        ) : (
          <span className="min-w-0 truncate">{label}</span>
        )}
        {hint && (
          <span className={cn('pointer-events-auto inline-flex shrink-0', compact && 'max-sm:hidden')}>
            <HintPopover label={`About ${label}`}>
              <p>{hint}</p>
            </HintPopover>
          </span>
        )}
        {hint && <span id={helpId} hidden>{hint}</span>}
      </span>
      <span className={cn('relative flex min-h-7 min-w-0 max-w-full items-center', STAT_ROW_PHONE_CENTER, interactive && 'pointer-events-none')} aria-hidden={interactive || undefined}>
        {loading ? (
          <Skeleton className="h-6 w-12" />
        ) : (
          <span className={cn('t-stat sm:t-figure', STAT_FIGURE, failed || (value === null && !text) ? 'text-text-muted' : FIGURE_TEXT[shownTone])}>
            {failed ? '-' : (text ?? (value === null ? '-' : <CountUp value={value} decimals={decimals} format={format ?? (decimals === 0 ? formatCount : undefined)} fromZero />))}
          </span>
        )}
      </span>
      {caption != null && (
        <span className={cn('relative line-clamp-1 t-meta text-text-muted', interactive && 'pointer-events-none')}>{caption}</span>
      )}
      {bar !== undefined && (
        <span className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-surface-hover', compact && 'max-sm:hidden', interactive && 'pointer-events-none')} aria-hidden="true">
          <span
            className={cn('block h-full rounded-full transition-[width] duration-500 ease-out', value === null || failed ? 'bg-border-hover' : FIGURE_BAR[shownTone])}
            style={{ width: `${loading || failed || bar === null ? 0 : Math.max(4, Math.min(100, bar))}%` }}
          />
        </span>
      )}
    </div>
  );
};
