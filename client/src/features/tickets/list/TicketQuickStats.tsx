import { statusTiles, type QuickFilterTile } from "../../../components/quickFilterStats";
import { Skeleton } from "../../../components/skeleton";
import { AdminChromeAccents } from "../../admin/AdminChromeAccents";
import { cn } from "@/lib/utils";

export type TicketQuickFilterKey = 'pending' | 'completed' | 'due' | 'delayed';

export interface TicketQuickFilterCounts {
  pending: number;
  completed: number;
  due: number;
  delayed: number;
}

// "Due Soon" rather than the catalogue's default "Due" — on Tickets the bucket means "approaching
// its TAT deadline", which is a narrower claim than the other modules' plain "Due".
const TILES = statusTiles<TicketQuickFilterKey>(['pending', 'completed', 'due', 'delayed'], { due: 'Due Soon' });
// The lead tile: the page's headline count, and the one tap back to everything.
const TOTAL_TILE: QuickFilterTile<'all'> = { ...statusTiles(['all'])[0], label: 'Total' };

interface TicketQuickStatsProps {
  counts: TicketQuickFilterCounts;
  /** Everything in scope, unfiltered — the number the page header used to state in words. */
  total: number;
  active: TicketQuickFilterKey | null;
  onToggle: (key: TicketQuickFilterKey) => void;
  onClear: () => void;
  isLoading?: boolean;
}

// One grid, one tile anatomy, at every width. The lead Total tile is a slim full-width strip below
// `lg` and the four buckets sit under it (2x2 on phones, 4 across from `sm`); at `lg` all five
// share a single row. Tiles stretch to the tallest in their row, so heights stay level, and every
// tile is well over 44px tall.
const GRID_CLASS = 'grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5 sm:gap-3 lg:gap-4';
const LEAD_SPAN_CLASS = 'col-span-2 sm:col-span-4 lg:col-span-1';

const TicketQuickStatsSkeleton = () => (
  <div className={GRID_CLASS}>
    {Array.from({ length: 5 }).map((_, i) => (
      <div
        key={i}
        className={cn(
          'flex gap-2 p-3 lg:p-3.5 rounded-xl border border-border bg-surface min-h-14 lg:min-h-24',
          i === 0
            ? cn(LEAD_SPAN_CLASS, 'flex-row items-center justify-between lg:flex-col lg:items-stretch lg:justify-start')
            : 'flex-col min-h-20',
        )}
      >
        <div className="flex items-center gap-2">
          <Skeleton className="size-7 rounded-lg shrink-0" />
          <Skeleton className="h-3.5 w-16 rounded" />
        </div>
        <Skeleton className="h-6 w-10 rounded" />
      </div>
    ))}
  </div>
);

export const TicketQuickStats = ({ counts, total, active, onToggle, onClear, isLoading }: TicketQuickStatsProps) => {
  const tiles: QuickFilterTile<TicketQuickFilterKey | 'all'>[] = [TOTAL_TILE, ...TILES];

  return (
    <div className="relative w-full animate-in fade-in slide-in-from-top-4 duration-700 ease-out fill-mode-both">
      {isLoading ? (
        <TicketQuickStatsSkeleton />
      ) : (
        <div className={GRID_CLASS}>
          {tiles.map((tile) => {
            const { key, label, icon: Icon, bgTint, accentBar, accentBorder, ring, iconTint } = tile;
            const isTotal = key === 'all';
            // Total is the resting state, so it reads as selected exactly when no bucket is.
            const isActive = isTotal ? active === null : active === key;
            const count = isTotal ? total : counts[key];
            // Share of the total, stated on the bucket tiles only (the Total tile is always 100%).
            const share = !isTotal && total ? Math.round((count / total) * 100) : null;
            const purpose = isTotal
              ? 'Show all tickets'
              : isActive ? `Clear "${label}" filter` : `Show only ${label.toLowerCase()} tickets`;
            const isHero = isTotal && isActive;

            return (
              <button
                key={key}
                type="button"
                onClick={() => (isTotal ? onClear() : onToggle(key))}
                aria-pressed={isActive}
                aria-label={`${purpose}, ${count}`}
                title={purpose}
                className={cn(
                  // tap-highlight off: Android Chrome otherwise flashes its own grey box on every tap.
                  'group relative flex gap-2 overflow-hidden p-3 lg:p-3.5 rounded-xl border text-left font-display cursor-pointer transition-colors duration-200 ease-in-out [-webkit-tap-highlight-color:transparent]',
                  'active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                  // Lead tile: slim strip (icon + label left, number right) until `lg`, then a tile.
                  isTotal
                    ? cn(LEAD_SPAN_CLASS, 'flex-row items-center justify-between min-h-14 lg:flex-col lg:items-stretch lg:justify-start lg:min-h-24')
                    : 'flex-col min-h-20 lg:min-h-24',
                  isHero
                    ? 'border-transparent bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 text-white'
                    : isActive
                      ? cn(accentBorder, bgTint)
                      : 'border-border bg-surface hover:border-border-hover',
                )}
              >
                {isHero && <AdminChromeAccents scale="compact" />}

                {/* Left accent bar on a selected bucket tile, same cue the shared stat tiles use. */}
                {!isTotal && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute inset-y-0 left-0 w-1 transition-opacity duration-200',
                      accentBar,
                      isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-40',
                    )}
                  />
                )}

                <span className="relative z-10 flex items-center gap-2 min-w-0">
                  <span
                    className={cn(
                      'flex items-center justify-center size-7 rounded-lg border shrink-0',
                      isHero ? 'border-white/20 bg-white/15' : cn(bgTint, ring),
                    )}
                  >
                    <Icon size={14} strokeWidth={2.5} className={isHero ? 'text-white' : iconTint} aria-hidden="true" />
                  </span>
                  <span className={cn('text-xs font-semibold leading-tight tracking-tight', isHero ? 'text-white/85' : 'text-text-muted')}>
                    {label}
                  </span>
                </span>

                <span className="relative z-10 flex items-baseline gap-1.5">
                  <span
                    className={cn(
                      'text-2xl font-bold leading-none tabular-nums tracking-tight',
                      isHero ? 'text-white' : isActive ? 'text-text' : 'text-text-secondary group-hover:text-text',
                    )}
                  >
                    {count}
                  </span>
                  {share !== null && (
                    <span className="text-[11px] font-semibold text-text-light tabular-nums">{share}%</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
