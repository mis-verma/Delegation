import type { LucideIcon } from 'lucide-react';
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

/** Same grid, same tile boxes — so nothing reflows when the counts arrive. Desktop/tablet only;
 * see QuickFilterStatsSkeleton's own comment for the mobile strip's matching placeholder. */
const QuickFilterStatsSkeleton = ({ count, variant }: { count: number; variant: 'default' | 'navy' }) => (
  <>
    <div className="flex sm:hidden items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-24 rounded-full shrink-0" />
      ))}
    </div>
    <div className={cn(gridClass(count), 'hidden sm:grid')}>
      {Array.from({ length: count }).map((_, i) => {
        const isHero = variant === 'navy' && i === 0;
        return (
          <div
            key={i}
            className={cn(
              'flex items-center justify-between gap-3 rounded-lg p-3.5 md:p-4',
              i === 0 && leadSpanClass(count),
              isHero
                ? 'bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700'
                : 'bg-surface border border-border',
            )}
          >
            <div className="flex flex-col gap-1.5 min-w-0">
              <Skeleton className={cn('h-7 w-12', isHero && 'bg-white/20')} />
              <Skeleton className={cn('h-3.5 w-20', isHero && 'bg-white/20')} />
            </div>
            <Skeleton className={cn('size-10 rounded-xl shrink-0', isHero && 'bg-white/20')} />
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
    <>
      {/* Combined mobile strip — below `sm` this row replaces the full card grid below it, not
          just a smaller version of it. Four-plus full cards (each with its own icon tile, label,
          and count) ran two-plus rows deep before a phone ever reached the actual list, so this
          collapses every tile into one line of small pill chips instead — same filter behavior,
          same colors, a fraction of the height. Desktop/tablet keep the full card grid untouched. */}
      <div className="flex sm:hidden items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
        {shownTiles.map((tile, index) => {
          const { key, label, bgTint, accentBorder } = tile;
          const isTotalTile = hasTotal && key === 'all';
          const isActive = isTotalTile ? active === null : active === key;
          const count = isTotalTile ? total : counts[key as K];
          const handleClick = () => (isTotalTile ? onClearFilter?.() : onToggle(key as K));
          const isHero = variant === 'navy' && index === 0;
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
              className={cn(
                'shrink-0 flex items-center gap-1.5 h-9 pl-3 pr-3.5 rounded-full border text-xs font-display font-semibold whitespace-nowrap transition-colors duration-200 cursor-pointer',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                isHero
                  ? 'border-transparent bg-primary-800 text-white'
                  : isActive
                    ? `${accentBorder} ${bgTint} text-text`
                    : 'border-border text-text-secondary hover:border-border-hover hover:text-text',
              )}
            >
              <span className={cn('tabular-nums font-bold', isHero && 'text-white')}>{count}</span>
              <span className={cn(isHero ? 'text-white/80' : isActive ? 'text-text' : 'text-text-muted')}>{label}</span>
            </button>
          );
        })}
      </div>

      <div className={cn(gridClass(shownTiles.length), 'hidden sm:grid')}>
      {shownTiles.map((tile, index) => {
        const { key, label, icon: Icon, bgTint, accentBar, accentBorder, ring, iconTint } = tile;
        const isTotalTile = hasTotal && key === 'all';
        // The Total tile is the resting state, so it reads as selected exactly when no bucket is.
        const isActive = isTotalTile ? active === null : active === key;
        const count = isTotalTile ? total : counts[key as K];
        const handleClick = () => (isTotalTile ? onClearFilter?.() : onToggle(key as K));
        const isHero = variant === 'navy' && index === 0;
        // `title` alone never appears on touch, where it was the only thing saying these tiles
        // filter at all. It stays for pointer users, but the same sentence is now also the
        // accessible name (aria-label) so the affordance survives on any device without needing a
        // dedicated resting glyph. `all` is the shared "clear the filter" key (see statusTiles), so
        // it needs the opposite sentence — "Show only all delegations" would have been nonsense.
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
                "group relative flex items-center justify-between gap-3 overflow-hidden rounded-lg p-3.5 md:p-4 text-left transition-all duration-400 ease-out cursor-pointer",
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
                {/* No `truncate` — these labels are short (1-3 words), but a 2-up mobile grid still
                    isn't wide enough for some of them ("Due Soon", "Assigned to you") at this font
                    size, and an ellipsis mid-word ("Due S...") reads worse than just wrapping. */}
                <p className="text-[11px] md:text-xs font-semibold text-white/80 mt-1.5 leading-snug tracking-tight">
                  {label}
                </p>
              </div>

              {/* Icon tile, same StatCard-style treatment as the plain tiles below (and every
                  StatCard on Dashboard/Calendar/admin analytics) — white-on-glass here since this
                  tile is already the bold navy surface. No extra badge/ring on top of it — the
                  tile's own border/shadow/lift above already say "selected", and a corner glyph on
                  a tile this small just read as clutter. */}
              <div className="relative z-10 shrink-0 flex items-center justify-center size-10 rounded-xl border border-white/20 bg-white/15 transition-transform duration-300 group-hover:scale-105">
                <Icon size={18} strokeWidth={2.5} className="text-white" />
              </div>
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

            <div className="min-w-0 flex-1">
              <p className={cn("text-2xl font-bold tracking-tight leading-none tabular-nums transition-colors", isActive ? "text-text" : "text-text-secondary group-hover:text-text")}>
                {count}
              </p>
              {/* See the hero tile's identical comment above — same wrap-not-truncate fix. */}
              <p className="text-[11px] md:text-xs font-semibold text-text-muted mt-1.5 leading-snug tracking-tight">
                {label}
              </p>
            </div>

            {/* Icon tile — the StatCard-style treatment this row was missing. No decorative ring
                behind it and no corner badge on top of it: at this tile's compact size (roughly a
                third of a Dashboard StatCard) StatCard's own oversized background ring read as a
                circle wrapped around the icon rather than a subtle flourish, and a badge stacked
                on top of that made it worse. The border/fill/left-bar changes above already say
                "selected" on their own. */}
            <div className={cn("flex items-center justify-center size-10 rounded-xl border transition-all duration-300 shrink-0 group-hover:scale-105", bgTint, ring)}>
              <Icon size={18} strokeWidth={2.5} className={iconTint} />
            </div>
          </button>
        );
      })}
      </div>
    </>
  );
}