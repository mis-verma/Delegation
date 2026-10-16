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
  /** A shorter word for a phone, where five tiles share one row and a long word used to break mid-word
   *  ("Complete / d"). Tablet and up, and the screen-reader name, keep `label`. */
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

// One row on every screen, phones included: as many equal columns as there are cards.
const gridStyle = (count: number) => ({ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` });

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
    <div className="grid gap-1.5 sm:gap-3" style={gridStyle(shownTiles.length)}>
      {/* Simple cards: the number big on the left, its name under it, a soft coloured icon on the right. Only
          late work gets a red number; a zero is quiet grey. The picked card's icon fills with its colour and its name turns bold; no border or line. */}
      {shownTiles.map((tile) => {
        const { key, label, shortLabel, icon: Icon, bgTint, iconTint, accentBar, accentBorder } = tile;
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
              'flex min-w-0 flex-col items-center justify-start gap-0.5 rounded-xl border px-0.5 py-2 text-center font-display outline-none',
              'sm:flex-row sm:items-start sm:justify-between sm:gap-3 sm:p-4 sm:text-left',
              'transition-colors duration-150 [-webkit-tap-highlight-color:transparent]',
              'focus-visible:ring-2 focus-visible:ring-primary-500/50',
              // Picked: the tile takes its colour (border and a soft tint); the rest stay plain.
              isActive ? cn(accentBorder, bgTint) : 'border-border bg-surface hover:border-border-hover',
            )}
          >
            <span className="min-w-0 max-w-full">
              <span className={cn(
                'block text-lg sm:text-3xl font-extrabold sm:font-bold tabular-nums leading-none',
                // On a phone there is no icon tile, so the picked card's number takes its colour instead.
                isActive ? cn(iconTint, 'sm:text-text') : count === 0 ? 'text-text-light' : LATE.has(key) ? 'text-danger' : 'text-text',
              )}>
                <CountUp value={count} />
              </span>
              {/* Phone: up to two lines, never an ellipsis. Five tiles at 320px leave about 50px each, so a
                  long word may hyphenate rather than get cut. The grid row keeps every tile the same height. */}
              <span className={cn('mt-1 sm:mt-1.5 block max-sm:t-meta max-sm:leading-tight max-sm:line-clamp-2 max-sm:hyphens-auto max-sm:[overflow-wrap:anywhere] sm:truncate sm:text-xs', isActive ? 'font-bold text-text' : 'font-medium text-text-muted')}>
                {shortLabel ? (<><span className="sm:hidden">{shortLabel}</span><span className="hidden sm:inline">{label}</span></>) : label}
              </span>
            </span>
            <span aria-hidden="true" className={cn('hidden sm:flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-150', cn(accentBar, 'text-white'))}>
              <Icon className="size-[1.125rem]" strokeWidth={2.25} />
            </span>
          </button>
        );
      })}
    </div>
  );
}