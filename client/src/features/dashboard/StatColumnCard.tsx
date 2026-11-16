import { type ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { usePrefetchRoute } from '../../lib/routePrefetch';
import { useStatCountFormat } from '../../lib/statCount';
import { STAT_FIGURE, STAT_PHONE_CENTER } from '../../components/statSurface';
import { ApprovalPills } from './ApprovalPills';
import { TONE, pathOf } from './boardLook';
import type { BoardTile } from './boardTypes';

const spoken = (t: BoardTile) => `${t.label}: ${t.failed ? 'could not load' : t.loading ? 'loading' : t.value}. ${t.caption}`;

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

const BREAKDOWN_SHORT: Record<string, string> = { 'Checklists, today': 'Checklists' };

const countClass = (value: number, flagged: boolean) =>
  value === 0 ? 'text-text-light' : flagged ? 'rounded-md bg-danger/10 px-1.5 text-danger' : 'text-text';

interface StatColumnCardProps {
  tile: BoardTile;
  className?: string;
}

export const StatColumnCard = ({ tile, className }: StatColumnCardProps) => {
  const formatCount = useStatCountFormat();
  const Icon = tile.icon;
  const tone = TONE[tile.tone];
  const flagged = tile.key === 'delayed';
  const parts = tile.breakdown ?? [];
  const approvals = tile.approvals;

  return (
    <TileShell
      tile={tile}
      className={cn(
        PRESS,
        'relative flex min-w-0 flex-col justify-between gap-2 bg-surface p-3 text-left touch-manipulation sm:p-4',
        STAT_PHONE_CENTER,
        tile.selected ? 'bg-primary-500/10 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary-600 dark:after:bg-primary-400' : 'hover:bg-surface-hover/60',
        className,
      )}
    >
      <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
        <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-md text-white', tone.tile)} aria-hidden="true">
          <Icon size={12} strokeWidth={2.75} />
        </span>
        <span className="min-w-0 truncate t-meta font-display font-semibold text-text-secondary">{tile.label}</span>
      </span>

      {(parts.length > 0 || approvals) && (
        <span className="hidden min-w-0 flex-col gap-1.5 sm:flex" aria-hidden="true">
          {parts.length > 0 && (
            <span className="flex flex-col gap-1">
              {parts.map((p) => (
                <span key={p.key} className="flex min-w-0 items-center justify-between gap-2 t-meta">
                  <span className="min-w-0 truncate text-text-muted">{BREAKDOWN_SHORT[p.label] ?? p.label}</span>
                  <span className={cn('shrink-0 font-bold tabular-nums', p.missing ? 'text-text-light' : countClass(p.value, flagged))}>{p.missing ? '-' : p.value}</span>
                </span>
              ))}
            </span>
          )}
          {approvals && (
            <span className={cn('flex flex-col gap-1.5', parts.length > 0 && 'border-t border-border/60 pt-1.5')}>
              <span className="flex min-w-0 items-center justify-between gap-2 t-meta">
                <span className="min-w-0 truncate font-semibold text-text-secondary">{approvals.label}</span>
                <span className={cn('shrink-0 font-bold tabular-nums', approvals.failed || approvals.loading ? 'text-text-light' : countClass(approvals.value, flagged))}>
                  {approvals.failed || approvals.loading ? '-' : approvals.value}
                </span>
              </span>
              <ApprovalPills parts={approvals.parts} missing={approvals.failed || approvals.loading} />
            </span>
          )}
        </span>
      )}

      <span className="flex min-w-0 max-w-full flex-col gap-0.5">
        <span className={cn('t-stat', STAT_FIGURE, tile.value > 0 ? tone.value : 'text-text')}>{tile.failed || tile.loading ? '-' : formatCount(tile.value)}</span>
        <span className="hidden sm:block t-meta text-text-muted line-clamp-2">{tile.failed ? "Couldn't load" : tile.caption}</span>
      </span>
    </TileShell>
  );
};
