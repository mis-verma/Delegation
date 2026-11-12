import { memo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePrefetchRoute } from '../../lib/routePrefetch';

export type BoardTone = 'primary' | 'danger' | 'coral' | 'success';

export interface BoardPart {
  key: string;
  label: string;
  value: number;
  icon: LucideIcon;
  href: string;
  missing?: boolean;
}

export interface BoardTile {
  key: string;
  label: string;
  value: number;
  caption: string;
  icon: LucideIcon;
  tone: BoardTone;
  breakdown?: readonly BoardPart[];
  href?: string;
  onSelect?: () => void;
  selected?: boolean;
  loading?: boolean;
  failed?: boolean;
}

const TONE: Record<BoardTone, { tile: string; value: string }> = {
  primary: { tile: 'bg-primary-600 dark:bg-primary-500', value: 'text-text' },
  danger: { tile: 'bg-danger', value: 'text-danger' },
  coral: { tile: 'bg-coral-500', value: 'text-text' },
  success: { tile: 'bg-success', value: 'text-text' },
};

const shown = (t: BoardTile) => (t.failed || t.loading ? '-' : t.value);

const spoken = (t: BoardTile) => `${t.label}: ${t.failed ? 'could not load' : t.loading ? 'loading' : t.value}. ${t.caption}`;

const pathOf = (href: string) => href.split('?')[0] ?? href;

const PRESS = 'outline-none transition-colors duration-150 ease-out active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/50';

const TileShell = ({ tile, className, children }: { tile: BoardTile; className: string; children: ReactNode }) => {
  const warm = usePrefetchRoute();
  if (tile.onSelect) {
    return (
      <button type="button" onClick={tile.onSelect} aria-pressed={!!tile.selected} aria-label={spoken(tile)} className={cn(className, 'cursor-pointer')}>
        {children}
      </button>
    );
  }
  if (tile.href) {
    const href = tile.href;
    return (
      <Link to={href} viewTransition aria-label={spoken(tile)} onPointerEnter={() => warm(pathOf(href))} onTouchStart={() => warm(pathOf(href))} className={cn(className, 'cursor-pointer')}>
        {children}
      </Link>
    );
  }
  return <div role="group" aria-label={spoken(tile)} className={className}>{children}</div>;
};

const COLS: Record<number, string> = {
  3: 'sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3',
  4: 'sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4',
  5: 'sm:grid-cols-5 lg:grid-cols-2 xl:grid-cols-5',
};

interface StatBoardProps {
  active: BoardTile;
  tiles: readonly BoardTile[];
  label: string;
  note?: string;
}

export const StatBoard = memo(({ active, tiles, label, note }: StatBoardProps) => {
  const warm = usePrefetchRoute();
  const ActiveIcon = active.icon;
  const parts = active.breakdown ?? [];
  const odd = tiles.length % 2 === 1;

  return (
    <div role="group" aria-label={label} className="flex flex-col overflow-hidden rounded-2xl bg-surface ring-1 ring-inset ring-border/60 lg:grid lg:grid-cols-[minmax(15rem,1fr)_minmax(0,2fr)]">
      <section aria-live="polite" aria-label={`${active.label} by area`} className="flex min-w-0 flex-col gap-3 bg-primary-800 p-4 text-white sm:p-5 dark:bg-primary-700">
        <div className="flex items-start justify-between gap-3">
          <span className="flex min-w-0 flex-col gap-1">
            <span className="inline-flex items-center gap-2 t-meta font-display font-semibold text-white/80">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/15" aria-hidden="true">
                <ActiveIcon size={15} strokeWidth={2.5} />
              </span>
              {active.label}
            </span>
            <span className="t-meta text-white/70">{active.failed ? "Couldn't load" : active.caption}</span>
          </span>
          <span className="t-figure font-figure font-extrabold leading-none tabular-nums">{shown(active)}</span>
        </div>
        <ul className="flex flex-col divide-y divide-white/10 rounded-xl bg-white/5">
          {parts.map((p) => {
            const Icon = p.icon;
            return (
              <li key={p.key}>
                <Link
                  to={p.href}
                  viewTransition
                  onPointerEnter={() => warm(pathOf(p.href))}
                  onTouchStart={() => warm(pathOf(p.href))}
                  aria-label={`${active.label}, ${p.label}: ${p.missing ? 'could not load' : p.value}. Open`}
                  className="group flex min-h-11 items-center gap-2.5 px-3 py-1.5 outline-none transition-colors duration-150 hover:bg-white/10 focus-visible:bg-white/10 active:bg-white/15"
                >
                  <Icon size={15} className="shrink-0 text-white/70" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate t-card font-display font-semibold">{p.label}</span>
                  <span className="t-card font-figure font-extrabold tabular-nums">{p.missing ? '-' : p.value}</span>
                  <ChevronRight size={15} className="shrink-0 text-white/60 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
        {note && <p className="t-meta text-white/60">{note}</p>}
      </section>

      <div className={cn('grid grid-cols-2 gap-px bg-border/50', COLS[tiles.length] ?? COLS[4])}>
        {tiles.map((tile, index) => {
          const Icon = tile.icon;
          const tone = TONE[tile.tone];
          return (
            <TileShell
              key={tile.key}
              tile={tile}
              className={cn(
                PRESS,
                'relative flex min-w-0 flex-col justify-between gap-2 bg-surface p-3 text-left sm:p-4',
                odd && index === tiles.length - 1 && 'col-span-2 sm:col-span-1 lg:col-span-2 xl:col-span-1',
                tile.selected ? 'bg-primary-500/10 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary-600 dark:after:bg-primary-400' : 'hover:bg-surface-hover/60',
              )}
            >
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-md text-white', tone.tile)} aria-hidden="true">
                  <Icon size={12} strokeWidth={2.75} />
                </span>
                <span className="min-w-0 truncate t-meta font-display font-semibold text-text-secondary">{tile.label}</span>
              </span>
              <span className="flex flex-col gap-0.5">
                <span className={cn('t-stat font-figure font-extrabold leading-none tabular-nums', tile.value > 0 ? tone.value : 'text-text')}>{shown(tile)}</span>
                <span className="hidden sm:block t-meta text-text-muted line-clamp-2">{tile.failed ? "Couldn't load" : tile.caption}</span>
              </span>
            </TileShell>
          );
        })}
      </div>
    </div>
  );
});
StatBoard.displayName = 'StatBoard';
