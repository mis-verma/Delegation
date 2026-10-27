import type { LucideIcon } from 'lucide-react';
import { Skeleton } from '../skeleton';
import { CountUp } from '../countUp';
import { statusTiles } from './statusTiles';
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

const QuickFilterStatsSkeleton = ({ count }: { count: number }) => (
  <div className="grid gap-1.5 sm:gap-3" style={gridStyle(count)} role="status" aria-label="Loading counts">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-surface p-2 sm:p-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-12" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="hidden sm:block size-9 rounded-lg" />
      </div>
    ))}
  </div>
);

const gridStyle = (count: number) => ({ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` });

const LATE = new Set<string>(['delayed', 'overdue']);

const RING_RADIUS = 8;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const ProgressRing = ({ percent, className }: { percent: number; className: string }) => (
  <svg viewBox="0 0 20 20" className={cn('size-5 shrink-0 -rotate-90', className)} aria-hidden="true">
    <circle cx="10" cy="10" r={RING_RADIUS} fill="none" strokeWidth="2.5" className="stroke-border" />
    <circle
      cx="10"
      cy="10"
      r={RING_RADIUS}
      fill="none"
      strokeWidth="2.5"
      strokeLinecap="round"
      stroke="currentColor"
      strokeDasharray={RING_LENGTH}
      strokeDashoffset={RING_LENGTH * (1 - percent / 100)}
      className="transition-[stroke-dashoffset] duration-500 ease-out"
    />
  </svg>
);

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
    <div className="grid gap-1.5 sm:gap-3" style={gridStyle(shownTiles.length)}>
      {shownTiles.map((tile) => {
        const { key, label, shortLabel, icon: Icon, iconTint, accentBar, accentBorder } = tile;
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
        return (
          <button
            key={key}
            type="button"
            onClick={handleClick}
            aria-pressed={isActive}
            aria-label={spoken}
            title={purpose}
            className={cn(
              'flex min-w-0 flex-col items-center justify-start gap-0.5 rounded-xl border px-0.5 py-2 text-center font-display outline-none',
              'sm:min-h-24 sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:p-4 sm:text-left',
              'transition-colors duration-150 [-webkit-tap-highlight-color:transparent]',
              'focus-visible:ring-2 focus-visible:ring-primary-500/50',
              isQuiet ? 'bg-surface-hover/40' : 'bg-surface',
              isActive ? cn(accentBorder, 'ring-2 ring-primary-500/20') : 'border-border hover:border-border-hover',
            )}
          >
            <span className="min-w-0 max-w-full">
              <span className={cn(
                'block t-stat font-extrabold sm:font-bold leading-none max-sm:tracking-tighter max-sm:break-all',
                isActive ? cn(iconTint, 'sm:text-text') : isQuiet ? 'text-text-muted' : LATE.has(key) ? 'text-danger' : 'text-text',
              )}>
                <CountUp value={count} />
              </span>
              <span className={cn('mt-1 sm:mt-1.5 block max-sm:t-meta max-sm:leading-tight max-sm:line-clamp-2 max-sm:hyphens-auto max-sm:[overflow-wrap:anywhere] sm:line-clamp-2 sm:leading-snug sm:t-meta', isActive ? 'font-bold text-text' : 'font-medium text-text-muted')}>
                {shortLabel ? (<><span className="sm:hidden">{shortLabel}</span><span className="hidden sm:inline">{label}</span></>) : label}
              </span>
              {hasTotal && !isTotalTile && (
                <span className="hidden sm:flex mt-2 items-center gap-1.5" aria-hidden="true">
                  <ProgressRing percent={percent} className={isQuiet ? 'text-text-muted' : iconTint} />
                  <span className="t-meta font-medium text-text-muted tabular-nums">{percent}%</span>
                </span>
              )}
            </span>
            <span aria-hidden="true" className={cn('hidden sm:flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-150', isQuiet ? 'bg-surface-hover text-text-muted' : cn(accentBar, 'text-white'))}>
              <Icon className="size-[1.125rem]" strokeWidth={2.25} />
            </span>
          </button>
        );
      })}
    </div>
  );
}