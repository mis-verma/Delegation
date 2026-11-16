import { memo } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePrefetchRoute } from '../../lib/routePrefetch';
import { useStatCountFormat } from '../../lib/statCount';
import { Skeleton } from '../../components/skeleton';
import { STAT_FIGURE, STAT_PHONE_CENTER } from '../../components/statSurface';
import { BREAKDOWN_SHORT_LABEL } from './work/statsConfig';
import { ApprovalPills } from './ApprovalPills';
import { TONE, pathOf } from './boardLook';
import type { BoardTile } from './boardTypes';

const spoken = (t: BoardTile) => `${t.label}: ${t.failed ? 'could not load' : t.loading ? 'loading' : t.value}. ${t.caption}`;

const FOCUS = 'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/50';

const countClass = (value: number, flagged: boolean, missing?: boolean) =>
  missing || value === 0 ? 'text-text-light' : flagged ? 'rounded-md bg-danger/10 px-1.5 text-danger' : 'text-text';

const ROW = 'relative z-10 -mx-1 flex min-h-6 min-w-0 items-center justify-between gap-2 rounded-md px-1 t-meta outline-none transition-colors duration-150 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary-500/50';

const CountSkeleton = () => <Skeleton className="h-3.5 w-5 shrink-0" />;

const ColumnSurface = ({ tile }: { tile: BoardTile }) => {
  const warm = usePrefetchRoute();
  const base = cn('absolute inset-0', FOCUS);
  if (tile.onSelect) {
    return <button type="button" onClick={tile.onSelect} aria-pressed={!!tile.selected} aria-label={spoken(tile)} className={cn(base, 'cursor-pointer')} />;
  }
  if (tile.href) {
    const href = tile.href;
    return (
      <Link
        to={href}
        viewTransition
        aria-label={spoken(tile)}
        onPointerEnter={() => warm(pathOf(href))}
        onTouchStart={() => warm(pathOf(href))}
        className={cn(base, 'cursor-pointer')}
      />
    );
  }
  return null;
};

interface StatColumnCardProps {
  tile: BoardTile;
  className?: string;
}

const StatColumnCardComponent = ({ tile, className }: StatColumnCardProps) => {
  const formatCount = useStatCountFormat();
  const warm = usePrefetchRoute();
  const Icon = tile.icon;
  const tone = TONE[tile.tone];
  const flagged = tile.key === 'delayed';
  const parts = tile.breakdown ?? [];
  const approvals = tile.approvals;
  const approvalsMissing = approvals?.failed || approvals?.loading;
  const interactive = !!tile.onSelect || !!tile.href;

  return (
    <div
      className={cn(
        'relative flex min-w-0 flex-col justify-between gap-2 bg-surface p-3 text-left touch-manipulation transition-colors duration-150 ease-out sm:p-4',
        STAT_PHONE_CENTER,
        tile.selected ? 'bg-primary-500/10 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary-600 dark:after:bg-primary-400' : interactive && 'hover:bg-surface-hover/60',
        className,
      )}
    >
      <ColumnSurface tile={tile} />

      <span className="pointer-events-none inline-flex min-w-0 max-w-full items-center gap-1.5">
        <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-md text-white', tone.tile)} aria-hidden="true">
          <Icon size={12} strokeWidth={2.75} />
        </span>
        <span className="min-w-0 truncate t-meta font-display font-semibold text-text-secondary">{tile.label}</span>
      </span>

      {(parts.length > 0 || approvals) && (
        <span className="hidden min-w-0 flex-col gap-1.5 sm:flex">
          {parts.length > 0 && (
            <span className="flex flex-col gap-0.5">
              {parts.map((p) => (
                <Link
                  key={p.key}
                  to={p.href}
                  viewTransition
                  onPointerEnter={() => warm(pathOf(p.href))}
                  aria-label={`${tile.label}, ${p.label}: ${p.missing ? 'could not load' : p.value}. Open`}
                  className={ROW}
                >
                  <span className="min-w-0 truncate text-text-muted">{BREAKDOWN_SHORT_LABEL[p.label] ?? p.label}</span>
                  {p.loading ? <CountSkeleton /> : <span className={cn('shrink-0 font-bold tabular-nums', countClass(p.value, flagged, p.missing))}>{p.missing ? '-' : p.value}</span>}
                </Link>
              ))}
            </span>
          )}
          {approvals && (
            <span className={cn('flex flex-col gap-1', parts.length > 0 && 'border-t border-border/60 pt-1.5')}>
              <Link
                to={approvals.href ?? '/verify'}
                viewTransition
                onPointerEnter={() => warm(pathOf(approvals.href ?? '/verify'))}
                aria-label={`${tile.label}, ${approvals.label}: ${approvalsMissing ? 'could not load' : approvals.value}. Open`}
                className={cn(ROW, 'group')}
              >
                <span className="min-w-0 truncate font-semibold text-text-secondary">{approvals.label}</span>
                <span className="flex shrink-0 items-center gap-0.5">
                  {approvals.loading ? <CountSkeleton /> : <span className={cn('font-bold tabular-nums', countClass(approvals.value, flagged, approvals.failed))}>{approvals.failed ? '-' : approvals.value}</span>}
                  <ChevronRight size={12} className="text-text-light transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </Link>
              <ApprovalPills parts={approvals.parts} missing={approvalsMissing} />
            </span>
          )}
        </span>
      )}

      <span className="pointer-events-none flex min-w-0 max-w-full flex-col gap-0.5">
        {tile.loading ? <Skeleton className="h-7 w-10" /> : <span className={cn('t-stat', STAT_FIGURE, tile.value > 0 ? tone.value : 'text-text')}>{tile.failed ? '-' : formatCount(tile.value)}</span>}
        <span className="hidden sm:block t-meta text-text-muted line-clamp-2">{tile.failed ? "Couldn't load" : tile.caption}</span>
      </span>
    </div>
  );
};

export const StatColumnCard = memo(StatColumnCardComponent);
