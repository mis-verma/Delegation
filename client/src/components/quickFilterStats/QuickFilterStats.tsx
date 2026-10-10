import type { LucideIcon } from 'lucide-react';
import { Skeleton } from '../skeleton';
import { CountUp } from '../countUp';
import { statusTiles } from './statusTiles';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * `icon`, `tint` and `accentRing` used to live here too, and every caller dutifully supplied them
 * — icon choices, `drop-shadow-sm` tints, `ring-*`/`shadow-lg` combinations — but the render below
 * only ever destructured `key`, `label`, `bgTint`, `accentBar` and `accentBorder`. None of it
 * reached the DOM. Removed so the type states what actually renders; build tiles with
 * `statusTiles()` rather than by hand.
 *
 * `icon`/`iconTint` came back deliberately (see statusTiles.ts) to close the one visible gap
 * between this component and StatCard: every StatCard-style stat on the Dashboard, Calendar and
 * admin analytics pages shows its icon in a tinted tile, and these tiles didn't.
 */
export interface QuickFilterTile<K extends string> {
  key: K;
  label: string;
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
  /** Kept so existing callers still compile; every tile is white with blue type now. */
  variant?: 'default' | 'navy';
  /**
   * While the page's query is still in flight its counts default to zero, so the row rendered a
   * confident "0 0 0 0" and then jumped to the real numbers. Pass the query's `isPending` to show
   * placeholders instead of numbers that aren't true yet.
   */
  isLoading?: boolean;
  /**
   * Pass the unfiltered count to prepend a lead "Total" tile. It reports this number, lights up
   * when nothing is filtered, and clicking it calls `onClearFilter` instead of applying a bucket —
   * so it's both the page's headline count and the one tap back to everything.
   *
   * This replaced each page's "N total tickets"-style header subtitle. Don't pass it from a module
   * that already declares its own `all` tile (the Compliance board's "Instances") — that one is a
   * real filter key with a count of its own, and it would end up rendered twice.
   */
  total?: number;
  /** Wording for the lead tile where "Total" isn't what the page counts. */
  totalLabel?: string;
  onClearFilter?: () => void;
}

/** Same strip, same cells, so nothing moves when the counts arrive. */
const QuickFilterStatsSkeleton = ({ count }: { count: number }) => (
  <div className={gridClass(count)} role="status" aria-label="Loading counts">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className={cn('flex items-start justify-between gap-3 rounded-xl border border-border bg-surface p-3 sm:p-4', i === 0 && leadSpan(count))}>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-12" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="size-8 sm:size-9 rounded-lg" />
      </div>
    ))}
  </div>
);

// Two across on a phone, all in one row from a wide screen. With an odd count the first card (the Total)
// takes the whole first row on a phone, so the rest pair up with no gap.
const gridClass = (count: number) => cn('grid grid-cols-2 gap-2.5 sm:gap-3', count >= 5 ? 'lg:grid-cols-5' : count === 3 ? 'sm:grid-cols-3' : 'lg:grid-cols-4');
const leadSpan = (count: number) => (count % 2 === 1 ? 'col-span-2 lg:col-span-1' : '');

// Only late work gets a colour (red); every other number is plain dark text.
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
  // Built here rather than by each caller: four modules were already one wrapper apiece around
  // this component, and hand-rolling the lead tile in each of them is exactly the duplication
  // statusTiles() exists to prevent.
  const shownTiles: QuickFilterTile<K | 'all'>[] = hasTotal
    ? [{ ...statusTiles(['all'])[0], label: totalLabel }, ...tiles]
    : tiles;

  if (isLoading) return <QuickFilterStatsSkeleton count={shownTiles.length} />;


  return (
    <div className={gridClass(shownTiles.length)}>
      {/* Simple cards: the number big on the left, its name under it, a soft coloured icon on the right. Only
          late work gets a red number; a zero is quiet grey. The picked card just gets a dark border. */}
      {shownTiles.map((tile, index) => {
        const { key, label, icon: Icon, bgTint, iconTint } = tile;
        const isTotalTile = hasTotal && key === 'all';
        const isActive = isTotalTile ? active === null : active === key;
        const count = (isTotalTile ? total : counts[key as K]) ?? 0;
        const handleClick = () => (isTotalTile ? onClearFilter?.() : onToggle(key as K));
        const purpose = key === 'all'
          ? `Show all ${itemLabel}`
          : isActive ? `Clear "${label}" filter` : `Show only ${label.toLowerCase()} ${itemLabel}`;
        return (
          <button
            key={key}
            type="button"
            onClick={handleClick}
            aria-pressed={isActive}
            aria-label={purpose}
            title={purpose}
            className={cn(
              'flex min-w-0 items-start justify-between gap-3 rounded-xl border bg-surface p-3 sm:p-4 text-left font-display outline-none',
              'transition-[border-color,box-shadow,transform] duration-150 active:scale-[0.985] [-webkit-tap-highlight-color:transparent]',
              'focus-visible:ring-2 focus-visible:ring-primary-500/50',
              index === 0 && leadSpan(shownTiles.length),
              isActive ? 'border-text ring-1 ring-inset ring-text' : 'border-border hover:border-border-hover',
            )}
          >
            <span className="min-w-0">
              <span className={cn('block text-2xl sm:text-3xl font-bold tabular-nums leading-none', count === 0 ? 'text-text-light' : LATE.has(key) ? 'text-danger' : 'text-text')}>
                <CountUp value={count} />
              </span>
              <span className={cn('mt-1.5 block truncate t-meta', isActive ? 'font-semibold text-text' : 'font-medium text-text-muted')}>{label}</span>
            </span>
            <span aria-hidden="true" className={cn('flex size-8 sm:size-9 shrink-0 items-center justify-center rounded-lg', bgTint, iconTint)}>
              <Icon className="size-4" />
            </span>
          </button>
        );
      })}
    </div>
  );
}