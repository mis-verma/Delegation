import { Check, ListFilter } from 'lucide-react';
import { AdminChromeAccents } from '../../features/admin/AdminChromeAccents';
import { Skeleton } from '../skeleton';
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
 */
export interface QuickFilterTile<K extends string> {
  key: K;
  label: string;
  bgTint: string;
  accentBar: string;
  accentBorder: string;
  ring: string;
}

interface QuickFilterStatsProps<K extends string> {
  tiles: QuickFilterTile<K>[];
  counts: Record<K, number>;
  active: K | null;
  onToggle: (key: K) => void;
  itemLabel: string;
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

/** Same grid, same tile boxes — so nothing reflows when the counts arrive. */
const QuickFilterStatsSkeleton = ({ count, variant }: { count: number; variant: 'default' | 'navy' }) => (
  <div className={gridClass(count)}>
    {Array.from({ length: count }).map((_, i) => {
      const isHero = variant === 'navy' && i === 0;
      return (
        <div
          key={i}
          className={cn(
            'flex flex-col justify-center gap-1.5 rounded-lg p-3.5 md:p-4',
            i === 0 && leadSpanClass(count),
            isHero
              ? 'bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700'
              : 'bg-surface border border-border',
          )}
        >
          <Skeleton className={cn('h-7 w-12', isHero && 'bg-white/20')} />
          <Skeleton className={cn('h-3.5 w-20', isHero && 'bg-white/20')} />
        </div>
      );
    })}
  </div>
);

// The row was a fixed 4-up. Delegation now leads with a "Total" tile, so the column count follows
// the tiles it was actually given rather than being hardcoded to what the first caller needed.
const gridClass = (count: number) =>
  cn('grid grid-cols-2 gap-3 md:gap-4', count >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4');

// An odd tile count leaves the last tile alone in a half-width cell on the 2-up mobile grid. The
// lead tile is the summary one, so it takes the whole row there instead and the remainder pairs up.
const leadSpanClass = (count: number) => (count % 2 === 1 ? 'col-span-2 lg:col-span-1' : '');

// One bold "hero" tile (navy gradient) plus sober white tiles for the rest — a full row of navy
// cards read as too heavy/loud, so only the lead tile (index 0, e.g. Pending/Instances/Due) gets
// it when `variant="navy"`; every other tile always renders in the plain white style below.
export function QuickFilterStats<K extends string>({
  tiles,
  counts,
  active,
  onToggle,
  itemLabel,
  variant = 'default',
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

  if (isLoading) return <QuickFilterStatsSkeleton count={shownTiles.length} variant={variant} />;

  return (
    <div className={gridClass(shownTiles.length)}>
      {shownTiles.map((tile, index) => {
        const { key, label, bgTint, accentBar, accentBorder, ring } = tile;
        const isTotalTile = hasTotal && key === 'all';
        // The Total tile is the resting state, so it reads as selected exactly when no bucket is.
        const isActive = isTotalTile ? active === null : active === key;
        const count = isTotalTile ? total : counts[key as K];
        const handleClick = () => (isTotalTile ? onClearFilter?.() : onToggle(key as K));
        const isHero = variant === 'navy' && index === 0;
        // `title` alone never appears on touch, where it was the only thing saying these tiles
        // filter at all. It stays for pointer users, but the same sentence is now also the
        // accessible name, and a resting filter glyph makes the affordance visible on any device.
        // `all` is the shared "clear the filter" key (see statusTiles), so it needs the opposite
        // sentence — "Show only all delegations" would have been nonsense.
        const purpose = key === 'all'
          ? `Show all ${itemLabel}`
          : isActive ? `Clear "${label}" filter` : `Show only ${label.toLowerCase()} ${itemLabel}`;

        if (isHero) {
          return (
            <button
              key={key}
              type="button"
              onClick={handleClick}
              aria-pressed={isActive}
              aria-label={purpose}
              title={purpose}
              className={cn(
                "group relative flex flex-col justify-center gap-1 overflow-hidden rounded-lg p-3.5 md:p-4 text-left transition-all duration-400 ease-out cursor-pointer",
                index === 0 && leadSpanClass(shownTiles.length),
                // All-token navy ramp (was `from-slate-900`, a raw Tailwind default in a project
                // that mandates its own palette). Kept identical to StatusBreakdownCard's shell —
                // these two navy tiles are deliberately the same surface. The shadow colour was
                // missed in that same sweep and is now on the palette too.
                "bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                // Was `ring-2 ring-white/60` — since this tile is "active" by default (it's the
                // resting state whenever no bucket is picked, per the comment above), a stark
                // 60%-opacity white ring was the tile's normal, permanent appearance, not just an
                // occasional selected-state accent. Against the app's own dark theme, with nothing
                // light nearby to blend into, that read exactly like a stray white border/box
                // around the card rather than a deliberate highlight. A thin, much softer ring
                // still marks it as the lead tile without looking like a mistake.
                isActive
                  ? "ring-1 ring-white/15 -translate-y-1 shadow-xl shadow-primary-900/20"
                  : "hover:-translate-y-1 hover:shadow-xl hover:shadow-primary-900/20 active:scale-[0.98]"
              )}
            >
              <AdminChromeAccents scale="compact" />

              <div className="relative z-10 min-w-0">
                <p className="text-2xl font-bold tracking-tight text-white leading-none tabular-nums">
                  {count}
                </p>
                <p className="text-[11px] md:text-xs font-semibold text-white/80 mt-1.5 truncate tracking-tight">
                  {label}
                </p>
              </div>

              <span aria-hidden="true" className="absolute top-3 right-3 z-10 flex items-center justify-center size-5">
                {isActive ? (
                  <span className="flex items-center justify-center size-5 rounded-full bg-white/25 text-white animate-in zoom-in-95 duration-200 motion-reduce:animate-none">
                    <Check size={12} strokeWidth={3} />
                  </span>
                ) : (
                  <ListFilter size={13} className="text-white/40 group-hover:text-white/70 transition-colors duration-200" />
                )}
              </span>
            </button>
          );
        }

        return (
          <button
            key={key}
            type="button"
            onClick={handleClick}
            aria-pressed={isActive}
            aria-label={purpose}
            title={purpose}
            className={cn(
              "group relative flex items-center gap-4 overflow-hidden rounded-lg p-3.5 md:p-4 text-left transition-all duration-200 cursor-pointer bg-surface border",
              index === 0 && leadSpanClass(shownTiles.length),
              // Was `focus:ring-primary-50/50` — #f0f4f8 at half opacity, i.e. an invisible focus
              // ring on a white surface, on the primary filter control of five different pages.
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
              isActive ? `${accentBorder} ${bgTint}` : "border-border hover:border-border-hover"
            )}
          >
            {/* Left accent bar */}
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-y-0 left-0 w-1.5 transition-opacity duration-300 rounded-l-lg",
                accentBar,
                isActive ? "opacity-100" : "opacity-0 group-hover:opacity-40"
              )}
            />

            {/* One quiet, theme-tinted ring — same "quiet card, one ring in the tile's own tone"
                treatment StatCard's plain variant uses, instead of this tile having no accent
                beyond the left bar and the tiny corner glyph. */}
            <span aria-hidden="true" className={cn("absolute -top-6 -right-6 size-16 rounded-full border pointer-events-none", ring)} />

            <div className="min-w-0 flex-1">
              <p className={cn("text-2xl font-bold tracking-tight leading-none tabular-nums transition-colors", isActive ? "text-text" : "text-text-secondary group-hover:text-text")}>
                {count}
              </p>
              <p className="text-[11px] md:text-xs font-semibold text-text-muted mt-1.5 truncate tracking-tight">
                {label}
              </p>
            </div>

            {/* Filter affordance at rest, confirmation when active — same slot either way. */}
            <span aria-hidden="true" className="absolute top-3 right-3 flex items-center justify-center size-5">
              {isActive ? (
                <span
                  className={cn(
                    "flex items-center justify-center size-5 rounded-full text-white animate-in zoom-in-95 duration-200 motion-reduce:animate-none",
                    accentBar
                  )}
                >
                  <Check size={12} strokeWidth={3} />
                </span>
              ) : (
                <ListFilter size={13} className="text-text-light/60 group-hover:text-text-muted transition-colors duration-200" />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}