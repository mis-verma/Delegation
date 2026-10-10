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
  <>
  <Skeleton className="sm:hidden h-24 rounded-xl" />
  <div
    className="hidden sm:grid gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60"
    style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    role="status"
    aria-label="Loading counts"
  >
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="flex flex-col gap-2 bg-surface px-3 py-3 sm:px-4">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-6 w-10" />
      </div>
    ))}
  </div>
  </>
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
  // Built here rather than by each caller: four modules were already one wrapper apiece around
  // this component, and hand-rolling the lead tile in each of them is exactly the duplication
  // statusTiles() exists to prevent.
  const shownTiles: QuickFilterTile<K | 'all'>[] = hasTotal
    ? [{ ...statusTiles(['all'])[0], label: totalLabel }, ...tiles]
    : tiles;

  // The phone's Total bar is split by status: done, late, due soon, and the rest still open. Built only from
  // buckets the page has; pending already includes due and late, so they are taken out of it.
  const countOf = (k: string) => (tiles.some((t) => t.key === k) ? counts[k as K] ?? 0 : 0);
  const barOf = (k: string) => tiles.find((t) => t.key === k)?.accentBar ?? '';
  const lateKey = tiles.some((t) => t.key === 'delayed') ? 'delayed' : 'overdue';
  const doneN = countOf('completed');
  const lateN = countOf(lateKey);
  const dueN = countOf('due');
  const openN = Math.max(0, countOf('pending') - lateN - dueN);
  const mix = [
    { label: 'Completed', value: doneN, bar: barOf('completed') },
    { label: 'Late', value: lateN, bar: barOf(lateKey) },
    { label: 'Due', value: dueN, bar: barOf('due') },
    { label: 'Open', value: openN, bar: barOf('pending') },
  ].filter((m) => m.value > 0 && m.bar);

  if (isLoading) return <QuickFilterStatsSkeleton count={shownTiles.length} />;

  // Phone: the buckets share one row under the Total (no 3 + 2 grid with an empty grey cell).
  const phoneCells = tiles.length;

  return (
    <div className="flex flex-col gap-2">
      <div className="sm:hidden overflow-hidden rounded-xl border border-border/60 bg-surface">
        {hasTotal && (
          <button
            type="button"
            onClick={() => onClearFilter?.()}
            aria-pressed={active === null}
            aria-label={`Show all ${itemLabel}`}
            className="relative flex min-h-11 w-full items-center justify-between gap-3 border-b border-border/60 px-3 py-2 text-left font-display outline-none active:bg-surface-hover [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/50"
          >
            <span className={cn('t-meta', active === null ? 'font-semibold text-text' : 'font-medium text-text-muted')}>{totalLabel} {itemLabel}</span>
            <span className={cn('text-lg font-bold tabular-nums leading-none', active === null ? 'text-primary-700 dark:text-primary-300' : (total ?? 0) === 0 ? 'text-text-light' : 'text-text')}>
              <CountUp value={total ?? 0} />
            </span>
            {active === null && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-primary-600 dark:bg-primary-400" />}
          </button>
        )}
        <div className="grid divide-x divide-border/60" style={{ gridTemplateColumns: `repeat(${phoneCells}, minmax(0, 1fr))` }}>
          {tiles.map((tile) => {
            const { key, label, accentBar } = tile;
            const isActive = active === key;
            const count = counts[key] ?? 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onToggle(key)}
                aria-pressed={isActive}
                aria-label={isActive ? `Clear "${label}" filter` : `Show only ${label.toLowerCase()} ${itemLabel}`}
                className="relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 font-display outline-none active:bg-surface-hover [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/50"
              >
                <span className={cn('text-lg font-bold tabular-nums leading-none', isActive ? 'text-primary-700 dark:text-primary-300' : count === 0 ? 'text-text-light' : 'text-text')}>
                  <CountUp value={count} />
                </span>
                <span className={cn('flex max-w-full items-center gap-1 text-[0.6875rem] leading-tight', isActive ? 'font-semibold text-text' : 'font-medium text-text-muted')}>
                  <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', accentBar)} />
                  <span className="truncate">{label}</span>
                </span>
                {isActive && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-primary-600 dark:bg-primary-400" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* One strip, cells split by thin lines, instead of a row of big empty boxes. Each cell: the label (with
          its status dot) in grey, the number under it. A zero is quiet, a real count is bold; the picked cell
          gets a blue line along its bottom and a blue number. Five cells go three and two on a phone. */}
      <div
        className="hidden sm:grid gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60"
        style={{ gridTemplateColumns: `repeat(${shownTiles.length}, minmax(0, 1fr))` }}
      >
        {shownTiles.map((tile) => {
          const { key, label, accentBar } = tile;
          const isTotalTile = hasTotal && key === 'all';
          // The Total cell is the resting state, so it reads as picked exactly when no bucket is.
          const isActive = isTotalTile ? active === null : active === key;
          const count = (isTotalTile ? total : counts[key as K]) ?? 0;
          const handleClick = () => (isTotalTile ? onClearFilter?.() : onToggle(key as K));
          // How big a slice this is of everything, beside the number. Not on the Total cell (always 100%).
          const share = hasTotal && !isTotalTile && total ? Math.round((count / total) * 100) : null;
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
                'relative flex min-w-0 flex-col items-start gap-1 bg-surface px-3 py-2.5 sm:px-4 sm:py-3 text-left font-display outline-none',
                'transition-colors duration-150 hover:bg-surface-hover/60 active:bg-surface-hover [-webkit-tap-highlight-color:transparent]',
                'focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/50',
              )}
            >
              <span className={cn('flex max-w-full items-center gap-1.5 t-meta', isActive ? 'font-semibold text-text' : 'font-medium text-text-muted')}>
                <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', accentBar)} />
                <span className="truncate">{label}</span>
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className={cn(
                  'text-xl sm:text-2xl font-bold tabular-nums leading-none',
                  isActive ? 'text-primary-700 dark:text-primary-300' : count === 0 ? 'text-text-light' : 'text-text',
                )}>
                  <CountUp value={count} />
                </span>
                {share !== null && count > 0 && <span className="hidden sm:inline t-meta font-medium text-text-light tabular-nums">{share}%</span>}
              </span>
              {isActive && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-primary-600 dark:bg-primary-400" />}
            </button>
          );
        })}
      </div>

      {/* Where there is a Total: one thin bar split by status, so the mix is visible at a glance. */}
      {hasTotal && !!total && mix.length > 0 && (
        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-hover" role="img" aria-label={mix.map((m) => `${m.label} ${m.value}`).join(', ')}>
          {mix.map((m) => <span key={m.label} className={cn('h-full', m.bar)} style={{ width: `${(m.value / total) * 100}%` }} />)}
        </div>
      )}
    </div>
  );
}