import { memo } from 'react';
import { Link } from 'react-router';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePrefetchRoute } from '../../lib/routePrefetch';
import { ApprovalPills } from './ApprovalPills';
import { StatColumnCard } from './StatColumnCard';
import { pathOf } from './boardLook';
import type { BoardTile } from './boardTypes';

export type { BoardApprovalPart, BoardApprovals, BoardPart, BoardTile, BoardTone } from './boardTypes';

const shown = (t: BoardTile) => (t.failed || t.loading ? '-' : t.value);

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
  const approvals = active.approvals;
  const odd = tiles.length % 2 === 1;
  const phoneTiles = tiles.filter((t) => !t.hideOnPhone);
  const lastPhoneKey = phoneTiles.length % 2 === 1 ? phoneTiles[phoneTiles.length - 1]?.key : undefined;

  return (
    <div role="group" aria-label={label} className="flex flex-col overflow-hidden rounded-2xl bg-surface ring-1 ring-inset ring-border/60 lg:grid lg:grid-cols-[minmax(15rem,1fr)_minmax(0,2fr)]">
      <section aria-label={`${active.label} by area`} className="flex min-w-0 flex-col gap-3 bg-primary-800 p-4 text-white sm:p-5 dark:bg-primary-700">
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
        {approvals && (
          <div className="flex flex-col gap-1.5 rounded-xl bg-white/5 px-3 py-2">
            <Link
              to={approvals.href ?? '/verify'}
              viewTransition
              onPointerEnter={() => warm(pathOf(approvals.href ?? '/verify'))}
              onTouchStart={() => warm(pathOf(approvals.href ?? '/verify'))}
              aria-label={`${approvals.label}: ${approvals.failed ? 'could not load' : approvals.value}. Open`}
              className="group -mx-1 flex min-h-8 items-center gap-2.5 rounded-lg px-1 outline-none transition-colors duration-150 hover:bg-white/10 focus-visible:bg-white/10 active:bg-white/15"
            >
              <ShieldCheck size={15} className="shrink-0 text-white/70" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate t-card font-display font-semibold">{approvals.label}</span>
              <span className="t-card font-figure font-extrabold tabular-nums">{approvals.failed || approvals.loading ? '-' : approvals.value}</span>
              <ChevronRight size={15} className="shrink-0 text-white/60 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
            <ApprovalPills parts={approvals.parts} missing={approvals.failed || approvals.loading} tone="dark" />
          </div>
        )}
        {note && <p className="t-meta text-white/60">{note}</p>}
      </section>

      <div className={cn('grid grid-cols-2 gap-px bg-border/50', COLS[tiles.length] ?? COLS[4])}>
        {tiles.map((tile, index) => (
          <StatColumnCard
            key={tile.key}
            tile={tile}
            className={cn(
              odd && index === tiles.length - 1 && 'lg:col-span-2 xl:col-span-1',
              tile.key === lastPhoneKey && 'max-sm:col-span-2',
              tile.hideOnPhone && 'max-sm:hidden',
            )}
          />
        ))}
      </div>
    </div>
  );
});
StatBoard.displayName = 'StatBoard';
