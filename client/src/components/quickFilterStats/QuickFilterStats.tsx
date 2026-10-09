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

// Phone row: equal-width cells, one per tile, never scrolls. Up to four fit one row; five or more wrap
// to rows of three, because a fifth cell at 320px is too narrow for "Completed" and gets clipped.
const mobileColumns = (count: number) => (count <= 4 ? count : 3);

/** Same grid, same tile boxes — so nothing reflows when the counts arrive. */
const QuickFilterStatsSkeleton = ({ count }: { count: number }) => (
  <>
    <div className="grid sm:hidden gap-2" style={{ gridTemplateColumns: `repeat(${mobileColumns(count)}, minmax(0, 1fr))` }}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-16 rounded-lg" />
      ))}
    </div>
    <div className={cn(gridClass(count), 'hidden sm:grid')}>
      {Array.from({ length: count }).map((_, i) => {
        return (
          <div
            key={i}
            className={cn(
              'flex items-center justify-between gap-3 lg:gap-2.5 xl:gap-3 rounded-lg p-3.5 md:p-4 lg:p-3 xl:p-4',
              i === 0 && leadSpanClass(count),
              'bg-surface border border-border',
            )}
          >
            <div className="flex flex-col gap-1.5 min-w-0">
              <Skeleton className="h-7 w-12" />
              <Skeleton className="h-3.5 w-20" />
            </div>
            <Skeleton className="size-10 lg:size-8 xl:size-10 rounded-xl shrink-0" />
          </div>
        );
      })}
    </div>
  </>
);

// The row was a fixed 4-up. Delegation now leads with a "Total" tile, so the column count follows
// the tiles it was actually given rather than being hardcoded to what the first caller needed.
const gridClass = (count: number) =>
  cn('grid grid-cols-2 gap-3 md:gap-4', count >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4');

// An odd tile count leaves the last tile alone in a half-width cell on the 2-up mobile grid. The
// lead tile is the summary one, so it takes the whole row there instead and the remainder pairs up.
const leadSpanClass = (count: number) => (count % 2 === 1 ? 'col-span-2 lg:col-span-1' : '');

// Every tile is the plain surface (white, or the dark theme's surface) with blue numbers and labels;
// the picked one gets a blue border and tint. The old navy lead tile is gone.
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
    <>
      {/* Phones: the Total is one slim full-width bar on top (it is the "show everything" control, not a
          bucket), then the status buckets share one even row underneath, so five tiles never leave a hole
          in a 3-up grid. Each cell is the label over the number, the same look as the dashboard's
          "Needs you today" block. Every cell is white (the dark theme's surface) with blue type; the picked one gets a blue border and tint. */}
      <div className="flex flex-col gap-2 sm:hidden">
        {hasTotal && (
          <button
            type="button"
            onClick={() => onClearFilter?.()}
            aria-pressed={active === null}
            aria-label={`Show all ${itemLabel}`}
            className={cn(
              'flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 font-display transition-colors duration-200 active:scale-[0.985] [-webkit-tap-highlight-color:transparent]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
              active === null ? 'border-primary-500 bg-primary-500/10 ring-1 ring-primary-500/30 text-primary-600/80 dark:text-primary-300/80' : 'border-border bg-surface text-primary-600/80 dark:text-primary-300/80',
            )}
          >
            <span className="t-meta font-semibold">{totalLabel} {itemLabel}</span>
            <span className="text-lg font-bold tabular-nums text-primary-700 dark:text-primary-300"><CountUp value={total ?? 0} /></span>
          </button>
        )}
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${mobileColumns(tiles.length)}, minmax(0, 1fr))` }}>
          {tiles.map((tile) => {
            const { key, label } = tile;
            const isActive = active === key;
            const count = counts[key];
            const purpose = isActive ? `Clear "${label}" filter` : `Show only ${label.toLowerCase()} ${itemLabel}`;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onToggle(key)}
                aria-pressed={isActive}
                aria-label={purpose}
                className={cn(
                  // tap-highlight off: Android Chrome otherwise flashes its own grey box on every tap.
                  'flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-2 font-display transition-colors duration-200 cursor-pointer active:scale-[0.985] [-webkit-tap-highlight-color:transparent]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                  isActive ? 'border-primary-500 bg-primary-500/10 ring-1 ring-primary-500/30' : 'border-border bg-surface',
                )}
              >
                {/* Wraps instead of cutting: four cells at 320px leave about 70px for "Completed". */}
                <span className="max-w-full line-clamp-2 text-center t-meta font-semibold leading-tight tracking-tight text-primary-600/80 dark:text-primary-300/80">{label}</span>
                <span className="text-xl font-bold tabular-nums leading-tight text-primary-700 dark:text-primary-300"><CountUp value={count} /></span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={cn(gridClass(shownTiles.length), 'hidden sm:grid')}>
      {shownTiles.map((tile, index) => {
        const { key, label, icon: Icon } = tile;
        const isTotalTile = hasTotal && key === 'all';
        // The Total tile is the resting state, so it reads as selected exactly when no bucket is.
        const isActive = isTotalTile ? active === null : active === key;
        const count = isTotalTile ? total : counts[key as K];
        const handleClick = () => (isTotalTile ? onClearFilter?.() : onToggle(key as K));
        // Only meaningful against a real total, and never on the Total tile itself (always 100%).
        const share = hasTotal && !isTotalTile && total ? Math.round(((count ?? 0) / total) * 100) : null;
        // `title` alone never appears on touch, where it was the only thing saying these tiles
        // filter at all. It stays for pointer users, but the same sentence is now also the
        // accessible name (aria-label) so the affordance survives on any device without needing a
        // dedicated resting glyph. `all` is the shared "clear the filter" key (see statusTiles), so
        // it needs the opposite sentence — "Show only all delegations" would have been nonsense.
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
              "group relative flex items-center gap-4 lg:gap-2.5 xl:gap-4 overflow-hidden rounded-lg p-3.5 md:p-4 lg:p-3 xl:p-4 text-left transition-all duration-200 cursor-pointer bg-surface border",
              index === 0 && leadSpanClass(shownTiles.length),
              // Was `focus:ring-primary-50/50` — #f0f4f8 at half opacity, i.e. an invisible focus
              // ring on a white surface, on the primary filter control of five different pages.
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
              isActive ? "border-primary-500 bg-primary-500/10 ring-1 ring-primary-500/30" : "border-border hover:border-primary-500/40"
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="text-2xl font-bold tracking-tight leading-none tabular-nums text-primary-700 dark:text-primary-300">
                {typeof count === 'number' ? <CountUp value={count} /> : count}
              </p>
              {/* See the hero tile's identical comment above — same wrap-not-truncate fix. The
                  share of the total rides on the label line, so "31 Delayed" also says how big a
                  slice that is without doing the maths. */}
              <p className="flex items-baseline gap-1.5 t-meta md:text-xs font-semibold text-primary-600/80 dark:text-primary-300/80 mt-1.5 leading-snug tracking-tight">
                {label}
                {share !== null && <span className="t-meta font-bold text-text-muted tabular-nums">{share}%</span>}
              </p>
            </div>


            {/* Icon tile — the StatCard-style treatment this row was missing. No decorative ring
                behind it and no corner badge on top of it: at this tile's compact size (roughly a
                third of a Dashboard StatCard) StatCard's own oversized background ring read as a
                circle wrapped around the icon rather than a subtle flourish, and a badge stacked
                on top of that made it worse. The border/fill/left-bar changes above already say
                "selected" on their own. */}
            <div className={cn("flex items-center justify-center size-10 lg:size-8 xl:size-10 rounded-xl border transition-colors duration-200 shrink-0", isActive ? "border-primary-500/40 bg-primary-500/15" : "border-primary-500/20 bg-primary-500/10")}>
              <Icon size={18} strokeWidth={2.25} className="size-[18px] lg:size-4 xl:size-[18px] text-primary-600 dark:text-primary-400" />
            </div>
          </button>
        );
      })}
      </div>
    </>
  );
}