import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react';
import { Skeleton } from '../../components/skeleton';
import { Pill, type PillTone } from '../../components/pill';
import { CountUp } from '../../components/countUp';
import { STAT_BAR, STAT_FIGURE, STAT_LABEL, STAT_SOLID, STAT_SURFACE, STAT_SURFACE_ACTION, STAT_SURFACE_SELECTED } from '../../components/statSurface';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: number | string;
  trend?: { direction: 'up' | 'down'; label: string };
  lowerIsBetter?: boolean;
  icon?: LucideIcon;
  iconTint?: string;
  iconBgTint?: string;
  caption?: string;
  onClick?: () => void;
  href?: string;
  isLoading?: boolean;
  compact?: boolean;
  highlight?: boolean;
  decorative?: boolean;
  selected?: boolean;
  labelAdornment?: ReactNode;
  valueTone?: 'success' | 'warning' | 'danger';
  modern?: boolean;
}

const VALUE_TONE = { success: 'text-vivid-green-text', warning: 'text-vivid-red-text', danger: 'text-vivid-red-text' } as const;

const COMPACT_THRESHOLD = 10_000;

const formatValue = (value: number | string) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
  if (Math.abs(value) < COMPACT_THRESHOLD) return value.toLocaleString();
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
};

type TrendMood = 'good' | 'bad' | 'flat';

const TREND_TONE: Record<TrendMood, PillTone> = { good: 'success', bad: 'danger', flat: 'neutral' };

export const StatCard = ({
  label,
  value,
  trend,
  icon: Icon,
  iconTint,
  caption,
  onClick,
  href,
  isLoading = false,
  compact = false,
  highlight = false,
  selected = false,
  lowerIsBetter = false,
  labelAdornment,
  valueTone,
}: StatCardProps) => {
  const isNoData = value === 'No data';
  const isPlaceholder = isNoData || value === '—';
  const isInteractive = Boolean(href) || Boolean(onClick);

  const hasTrend = trend != null && trend.label !== '' && trend.label !== '—' && trend.label !== 'No data';
  const isFlat = hasTrend && Number.parseFloat(trend.label) === 0;
  const trendMood: TrendMood = !hasTrend || isFlat ? 'flat' : trend.direction === 'up' !== lowerIsBetter ? 'good' : 'bad';
  const TrendIcon = isFlat ? Minus : trend?.direction === 'up' ? ArrowUpRight : ArrowDownRight;

  const rootClass = cn(
    'group relative isolate flex min-w-0 flex-col justify-between gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60',
    STAT_SURFACE,
    compact ? 'p-4 sm:p-5' : 'p-5 sm:p-6',
    highlight && STAT_SOLID,
    !highlight && selected && STAT_SURFACE_SELECTED,
    isInteractive && STAT_SURFACE_ACTION,
    selected && cn(STAT_BAR, highlight && 'after:bg-white/80 dark:after:bg-white/80'),
  );

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={cn(STAT_LABEL, 'line-clamp-2 leading-snug break-words', highlight && 'text-white/75')}>{label}</span>
            {labelAdornment && (
              <span
                className="relative z-20 inline-flex shrink-0"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onKeyDown={(e) => e.stopPropagation()}
              >
                {labelAdornment}
              </span>
            )}
          </div>

          {isLoading ? (
            <Skeleton className="h-9 w-20 rounded-md" />
          ) : (
            <p
              className={cn(
                isNoData ? 't-card font-display font-bold' : cn('t-figure break-words', STAT_FIGURE),
                isPlaceholder
                  ? highlight ? 'text-white/50' : isNoData ? 'text-text-muted' : 'text-text-light/60'
                  : highlight ? 'text-white' : valueTone ? VALUE_TONE[valueTone] : selected ? 'text-primary-700 dark:text-primary-300' : 'text-text',
              )}
              title={typeof value === 'number' && Math.abs(value) >= COMPACT_THRESHOLD ? value.toLocaleString() : undefined}
            >
              {typeof value === 'number' && Number.isFinite(value) ? <CountUp value={value} format={formatValue} /> : formatValue(value)}
            </p>
          )}
        </div>

        {Icon && <Icon className={cn('size-[1.125rem] shrink-0', highlight ? 'text-white/80' : iconTint ?? 'text-text-muted')} strokeWidth={2.25} aria-hidden="true" />}
      </div>

      {(hasTrend || caption) && (
        <div className="pointer-events-none relative z-10 flex flex-wrap items-center gap-x-2 gap-y-1">
          {hasTrend && <Pill tone={TREND_TONE[trendMood]} icon={TrendIcon}>{trend.label}</Pill>}
          {caption && <span className={cn('line-clamp-2 max-w-full t-meta font-medium leading-snug', highlight ? 'text-white/70' : 'text-text-muted')}>{caption}</span>}
        </div>
      )}
    </>
  );

  return (
    <div
      onClick={!href ? onClick : undefined}
      role={onClick && !href ? 'button' : undefined}
      tabIndex={onClick && !href ? 0 : undefined}
      aria-pressed={onClick && !href ? selected : undefined}
      onKeyDown={
        onClick && !href
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={rootClass}
    >
      {href && (
        <Link
          viewTransition
          to={href}
          aria-label={`${label}: ${formatValue(value)}. View details`}
          className="absolute inset-0 z-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60"
        />
      )}
      {content}
    </div>
  );
};
