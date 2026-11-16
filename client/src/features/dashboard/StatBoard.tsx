import { memo } from 'react';
import { Link } from 'react-router';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePrefetchRoute } from '../../lib/routePrefetch';
import { Skeleton } from '../../components/skeleton';
import { ApprovalPills } from './ApprovalPills';
import { ModuleStatCard } from './ModuleStatCard';
import { pathOf } from './boardLook';
import type { BoardColumn, BoardSummary } from './boardTypes';

export type { BoardApprovalPart, BoardApprovals, BoardColumn, BoardPart, BoardRow, BoardSummary, BoardTone } from './boardTypes';

const COLS: Record<number, string> = {
  2: 'sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2',
  3: 'sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3',
  4: 'sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4',
};

interface StatBoardProps {
  summary: BoardSummary;
  columns: readonly BoardColumn[];
  label: string;
  note?: string;
}

export const StatBoard = memo(({ summary, columns, label, note }: StatBoardProps) => {
  const warm = usePrefetchRoute();
  const SummaryIcon = summary.icon;
  const approvals = summary.approvals;
  const odd = columns.length % 2 === 1;
  const prefetch = (href: string) => () => warm(pathOf(href));

  return (
    <div role="group" aria-label={label} className="flex flex-col overflow-hidden rounded-2xl bg-surface ring-1 ring-inset ring-border/60 lg:grid lg:grid-cols-[minmax(15rem,1fr)_minmax(0,2fr)]">
      <section aria-label={`${summary.label} by area`} className="flex min-w-0 flex-col gap-3 bg-primary-800 p-4 text-white sm:p-5 dark:bg-primary-700">
        <Link
          to={summary.href}
          viewTransition
          onPointerEnter={prefetch(summary.href)}
          onFocus={prefetch(summary.href)}
          onTouchStart={prefetch(summary.href)}
          aria-label={`${summary.label}: ${summary.failed ? 'could not load' : summary.loading ? 'loading' : summary.total}. ${summary.caption}. Open the full list`}
          className="-m-1 flex items-start justify-between gap-3 rounded-lg p-1 outline-none transition-colors duration-150 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white/60"
        >
          <span className="flex min-w-0 flex-col gap-1">
            <span className="inline-flex items-center gap-2 t-meta font-display font-semibold text-white/80">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/15" aria-hidden="true">
                <SummaryIcon size={15} strokeWidth={2.5} />
              </span>
              {summary.label}
            </span>
            <span className="t-meta text-white/70">{summary.failed ? "Couldn't load" : summary.caption}</span>
          </span>
          {summary.loading
            ? <Skeleton className="h-8 w-12 bg-white/15" />
            : <span className="t-figure font-figure font-extrabold leading-none tabular-nums">{summary.failed ? '-' : summary.total}</span>}
        </Link>

        <ul className="flex flex-col divide-y divide-white/10 rounded-xl bg-white/5">
          {summary.parts.map((p) => {
            const Icon = p.icon;
            return (
              <li key={p.key}>
                <Link
                  to={p.href}
                  viewTransition
                  onPointerEnter={prefetch(p.href)}
                  onFocus={prefetch(p.href)}
                  onTouchStart={prefetch(p.href)}
                  aria-label={`${summary.label}, ${p.label}: ${p.loading ? 'loading' : p.missing ? 'could not load' : p.value}. Open`}
                  className="group flex min-h-11 items-center gap-2.5 px-3 py-1.5 outline-none transition-colors duration-150 hover:bg-white/10 focus-visible:bg-white/10 active:bg-white/15"
                >
                  <Icon size={15} className="shrink-0 text-white/70" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate t-card font-display font-semibold">{p.label}</span>
                  {p.loading
                    ? <Skeleton className="h-4 w-6 bg-white/15" />
                    : <span className="t-card font-figure font-extrabold tabular-nums">{p.missing ? '-' : p.value}</span>}
                  <ChevronRight size={15} className="shrink-0 text-white/60 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>

        {approvals && (
          <div className="flex flex-col gap-1.5 rounded-xl bg-white/5 px-3 py-2">
            <Link
              to={approvals.href ?? summary.href}
              viewTransition
              onPointerEnter={prefetch(approvals.href ?? summary.href)}
              onFocus={prefetch(approvals.href ?? summary.href)}
              onTouchStart={prefetch(approvals.href ?? summary.href)}
              aria-label={`${approvals.label}: ${approvals.failed ? 'could not load' : approvals.value}. Open`}
              className="group -mx-1 flex min-h-8 items-center gap-2.5 rounded-lg px-1 outline-none transition-colors duration-150 hover:bg-white/10 focus-visible:bg-white/10 active:bg-white/15"
            >
              <ShieldCheck size={15} className="shrink-0 text-white/70" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate t-card font-display font-semibold">{approvals.label}</span>
              {approvals.loading
                ? <Skeleton className="h-4 w-6 bg-white/15" />
                : <span className="t-card font-figure font-extrabold tabular-nums">{approvals.failed ? '-' : approvals.value}</span>}
              <ChevronRight size={15} className="shrink-0 text-white/60 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
            <ApprovalPills parts={approvals.parts} missing={approvals.failed || approvals.loading} tone="dark" />
          </div>
        )}

        {note && <p className="t-meta text-white/60">{note}</p>}
      </section>

      <div className={cn('grid grid-cols-2 gap-px bg-border/50', COLS[columns.length] ?? COLS[4])}>
        {columns.map((column, index) => (
          <ModuleStatCard
            key={column.key}
            column={column}
            className={odd && index === columns.length - 1 ? 'max-sm:col-span-2 lg:col-span-2 xl:col-span-1' : undefined}
          />
        ))}
      </div>
    </div>
  );
});
StatBoard.displayName = 'StatBoard';
