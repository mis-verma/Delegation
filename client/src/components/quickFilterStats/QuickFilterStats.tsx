import type { LucideIcon } from 'lucide-react';
import { Skeleton } from '../skeleton';
import { CountUp } from '../countUp';
import { statusTiles } from './statusTiles';
import { STAT_BAR_SMALL, STAT_FIGURE, STAT_LABEL, STAT_SURFACE, STAT_SURFACE_ACTION, STAT_SURFACE_SELECTED } from '../statSurface';
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
      <div key={i} className={cn(STAT_SURFACE, 'flex flex-col gap-3 p-2 sm:p-5')}>
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
              'flex min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 py-2 text-center font-display outline-none max-sm:min-h-20',
              'sm:min-h-0 sm:items-stretch sm:justify-between sm:gap-3 sm:p-5 sm:text-left',
              '[-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-primary-500/50',
              STAT_SURFACE,
              STAT_SURFACE_ACTION,
              isActive && cn(STAT_SURFACE_SELECTED, STAT_BAR_SMALL),
            )}
          >
            <Icon className={cn('size-4 shrink-0 sm:hidden', iconColor)} strokeWidth={2.5} aria-hidden="true" />
            <span className="hidden items-center justify-between gap-3 sm:flex">
              <span className={cn(STAT_LABEL, 'line-clamp-1')}>{label}</span>
              <Icon className={cn('size-[1.125rem] shrink-0', iconColor)} strokeWidth={2.25} aria-hidden="true" />
            </span>
            <span
              className={cn(
                'block t-stat sm:t-figure max-sm:tracking-tighter max-sm:break-all',
                STAT_FIGURE,
                late ? 'text-vivid-red-text' : isQuiet ? 'text-text-muted' : isActive ? 'text-primary-700 dark:text-primary-300' : 'text-text',
              )}
            >
              <CountUp value={count} />
            </span>
            <span className={cn('block max-sm:t-meta max-sm:leading-tight max-sm:line-clamp-2 max-sm:[overflow-wrap:anywhere] sm:hidden', isActive ? 'font-bold text-text' : 'font-medium text-text-muted')}>
              {shortLabel ?? label}
            </span>
            {hasTotal && !isTotalTile ? (
              <span className="hidden t-meta font-medium text-text-muted tabular-nums sm:block">{percent}% of {total}</span>
            ) : (
              <span className="hidden t-meta font-medium text-text-muted sm:block">{isTotalTile ? 'All shown' : itemLabel}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
