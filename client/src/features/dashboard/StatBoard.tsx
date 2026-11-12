import { memo, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePrefetchRoute } from '../../lib/routePrefetch';

export type BoardTone = 'primary' | 'danger' | 'coral' | 'success';

export interface BoardPart {
  key: string;
  label: string;
  value: number;
  missing?: boolean;
}

export interface BoardTile {
  key: string;
  label: string;
  value: number;
  breakdown?: readonly BoardPart[];
  caption: string;
  icon: LucideIcon;
  tone: BoardTone;
  href?: string;
  onSelect?: () => void;
  selected?: boolean;
  controls?: string;
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

const Shell = ({ tile, className, children }: { tile: BoardTile; className: string; children: ReactNode }) => {
  const warm = usePrefetchRoute();
  if (tile.onSelect) {
    return (
      <button type="button" onClick={tile.onSelect} aria-expanded={!!tile.selected} aria-controls={tile.controls} aria-label={spoken(tile)} className={cn(className, 'cursor-pointer')}>
        {children}
      </button>
    );
  }
  if (tile.href) {
    const href = tile.href;
    return (
      <Link to={href} viewTransition aria-label={spoken(tile)} onPointerEnter={() => warm(pathOf(href))} onTouchStart={() => warm(pathOf(href))} className={className}>
        {children}
      </Link>
    );
  }
  return <div role="group" aria-label={spoken(tile)} className={className}>{children}</div>;
};

const PRESS = 'outline-none transition-colors duration-150 ease-out active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/50';

interface StatBoardProps {
  total: BoardTile;
  tiles: readonly BoardTile[];
  label: string;
  open?: number;
}

const Breakdown = ({ parts, light = false }: { parts: readonly BoardPart[]; light?: boolean }) => (
  <ul className={cn('hidden lg:flex flex-col gap-1 border-t pt-2', light ? 'border-white/15' : 'border-border/50')}>
    {parts.map((p) => (
      <li key={p.key} className="flex items-center justify-between gap-2 t-meta">
        <span className={cn('min-w-0 truncate', light ? 'text-white/75' : 'text-text-muted')}>{p.label}</span>
        <span className={cn('shrink-0 font-semibold tabular-nums', light ? 'text-white' : 'text-text')}>{p.missing ? '-' : p.value}</span>
      </li>
    ))}
  </ul>
);

export const StatBoard = memo(({ total, tiles, label, open }: StatBoardProps) => {
  const TotalIcon = total.icon;
  const showDone = open !== undefined && !total.loading && !total.failed && total.value > 0;
  const done = showDone ? Math.max(0, total.value - (open ?? 0)) : 0;
  const donePct = showDone ? Math.round((done / total.value) * 100) : 0;
  return (
    <div role="group" aria-label={label} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] overflow-hidden rounded-2xl bg-surface ring-1 ring-inset ring-border/60 sm:grid-cols-[minmax(11rem,1fr)_minmax(0,4fr)]">
      <Shell
        tile={total}
        className={cn(
          PRESS,
          'flex min-w-0 flex-col justify-between gap-3 bg-primary-800 p-4 text-left text-white sm:p-5 dark:bg-primary-700',
          total.selected ? 'ring-2 ring-inset ring-white/60' : 'hover:bg-primary-900 dark:hover:bg-primary-800',
        )}
      >
        <span className="inline-flex items-center gap-2 t-meta font-display font-semibold text-white/80">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/15" aria-hidden="true">
            <TotalIcon size={15} strokeWidth={2.5} />
          </span>
          {total.label}
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="t-figure font-figure font-extrabold leading-none tabular-nums">{shown(total)}</span>
          <span className="t-meta font-medium text-white/75 line-clamp-2">{total.failed ? "Couldn't load" : total.caption}</span>
        </span>
        {showDone && (
          <span className="hidden sm:flex flex-col gap-1.5">
            <span className="flex items-center justify-between gap-2 t-meta text-white/80">
              <span>{done} done, {open} open</span>
              <span className="font-semibold tabular-nums text-white">{donePct}%</span>
            </span>
            <span className="h-1.5 w-full overflow-hidden rounded-full bg-white/15" aria-hidden="true">
              <span className="block h-full rounded-full bg-white" style={{ width: `${donePct}%` }} />
            </span>
          </span>
        )}
        {total.breakdown && <Breakdown parts={total.breakdown} light />}
      </Shell>

      <div className="grid grid-cols-2 gap-px bg-border/50 sm:grid-cols-4">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          const tone = TONE[tile.tone];
          return (
            <Shell
              key={tile.key}
              tile={tile}
              className={cn(
                PRESS,
                'relative flex min-w-0 flex-col justify-start gap-2 bg-surface p-3 text-left sm:p-4',
                tile.onSelect || tile.href ? 'hover:bg-surface-hover/60' : '',
                tile.selected && 'bg-primary-500/10 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary-600 dark:after:bg-primary-400',
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
              {tile.breakdown && <Breakdown parts={tile.breakdown} />}
            </Shell>
          );
        })}
      </div>
    </div>
  );
});
StatBoard.displayName = 'StatBoard';
