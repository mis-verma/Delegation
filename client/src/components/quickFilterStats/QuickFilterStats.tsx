import type { LucideIcon } from 'lucide-react';
import { Skeleton } from '../skeleton';
import { CountUp } from '../countUp';
import { statusTiles } from './statusTiles';
import { STAT_BAR_SMALL, STAT_FIGURE, STAT_LABEL } from '../statSurface';
import { useStatCountFormat } from '../../lib/statCount';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface QuickFilterTile<K extends string> {
  key: K;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
  bgTint: string;
  accentBar: string;
  accentBorder: string;
  ring: string;
  iconTint: string;
}

interface QuickFilterStatsProps<K extends string> {
  tiles: QuickFilterTile<K>[];
  counts: Record<K, number>;
  active: K | null;
  onToggle: (key: K) => void;
  itemLabel: string;
  variant?: 'default' | 'navy';
  isLoading?: boolean;
  total?: number;
  totalLabel?: string;
  onClearFilter?: () => void;
}

const gridStyle = (count: number) => ({ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` });

const QuickFilterStatsSkeleton = ({ count }: { count: number }) => (
  <div className="grid gap-1.5 sm:gap-3 lg:gap-4" style={gridStyle(count)} role="status" aria-label="Loading counts">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="flex flex-col gap-3 p-3 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs">
        <Skeleton className="hidden h-3 w-16 sm:block" />
        <Skeleton className="h-7 w-12 sm:h-9 sm:w-20" />
        <Skeleton className="h-3 w-14" />
      </div>
    ))}
  </div>
);

const LATE = new Set<string>(['delayed', 'overdue']);

export function QuickFilterStats<K extends string>({
  tiles,
  counts,
  active,
  onToggle,
  itemLabel,
  isLoading = false,
  total,
  totalLabel = 'Total',
  onClearFilter,
}: QuickFilterStatsProps<K>) {
  const hasTotal = total !== undefined;
  const formatCount = useStatCountFormat();
  const shownTiles: QuickFilterTile<K | 'all'>[] = hasTotal
    ? [{ ...statusTiles(['all'])[0], label: totalLabel }, ...tiles]
    : tiles;

  if (isLoading) return <QuickFilterStatsSkeleton count={shownTiles.length} />;

  return (
    <div className="grid gap-1.5 sm:gap-3 lg:gap-4" style={gridStyle(shownTiles.length)}>
      {shownTiles.map((tile) => {
        const { key, label, shortLabel, icon: Icon, iconTint } = tile;
        const isTotalTile = hasTotal && key === 'all';
        const isActive = isTotalTile ? active === null : active === key;
        const count = (isTotalTile ? total : counts[key as K]) ?? 0;
        const handleClick = () => (isTotalTile ? onClearFilter?.() : onToggle(key as K));
        const isQuiet = count === 0 && !isActive;
        const percent = total ? Math.round((count / total) * 100) : 0;
        const purpose = key === 'all'
          ? `Show all ${itemLabel}`
          : isActive ? `Clear "${label}" filter` : `Show only ${label.toLowerCase()} ${itemLabel}`;
        const spoken = `${label}: ${count}${hasTotal && !isTotalTile ? ` of ${total}` : ''}. ${purpose}`;
        const late = LATE.has(key) && count > 0;
        const iconColor = isQuiet ? 'text-text-muted' : late ? 'text-vivid-red-text' : iconTint;
        return (
          <button
            key={key}
            type="button"
            onClick={handleClick}
            aria-pressed={isActive}
            aria-label={spoken}
            title={purpose}
            className={cn(
              'flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-center font-display outline-none max-sm:min-h-20',
              'sm:min-h-0 sm:items-stretch sm:justify-between sm:gap-2.5 sm:p-4 lg:p-5 sm:text-left',
              'rounded-2xl border transition-all duration-200 ease-out',
              'touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-primary-500/50',
              isActive
                ? 'bg-white dark:bg-slate-900 border-primary-500/90 dark:border-primary-400 shadow-sm ring-2 ring-primary-500/20'
                : 'bg-white dark:bg-slate-900/70 border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-xs hover:-translate-y-0.5',
              isActive && STAT_BAR_SMALL,
            )}
          >
            <span className="flex items-center justify-between gap-2 w-full">
              <span className={cn('max-sm:hidden line-clamp-1', STAT_LABEL)}>{label}</span>
              <span
                className={cn(
                  'flex size-7 sm:size-8 items-center justify-center rounded-xl transition-all duration-200 shrink-0',
                  isQuiet ? 'bg-slate-100 text-text-muted dark:bg-slate-800' : tile.bgTint,
                  !isQuiet && iconColor,
                )}
              >
                <Icon className="size-3.5 sm:size-4" strokeWidth={2.25} aria-hidden="true" />
              </span>
            </span>
            <span
              className={cn(
                'block min-w-0 max-w-full t-stat sm:t-figure',
                STAT_FIGURE,
                late ? 'text-vivid-red-text' : isQuiet ? 'text-text-muted' : isActive ? 'text-primary-700 dark:text-primary-300' : 'text-text',
              )}
            >
              <CountUp value={count} format={formatCount} />
            </span>
            <span className={cn('block max-sm:t-meta max-sm:leading-tight max-sm:line-clamp-2 max-sm:[overflow-wrap:anywhere] sm:hidden', isActive ? 'font-bold text-text' : 'font-medium text-text-muted')}>
              {shortLabel ?? label}
            </span>
            <div className="hidden sm:flex flex-col gap-1.5 w-full">
              {hasTotal && !isTotalTile ? (
                <>
                  <span className="t-meta font-medium text-text-muted tabular-nums">{percent}% of {total}</span>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800/80">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500 ease-out', tile.accentBar)}
                      style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                    />
                  </div>
                </>
              ) : (
                <span className="t-meta font-medium text-text-muted">{isTotalTile ? 'All shown' : itemLabel}</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
