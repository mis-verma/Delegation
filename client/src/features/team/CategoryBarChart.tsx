import { BarChart3 } from 'lucide-react';
import { EmptyState } from '../../components';
import { cn } from '../../lib/utils';
import { rateBarClass } from '../checklist/checklistDisplay';

export interface CategoryBar {
  key: string;
  label: string;
  done: number;
  total: number;
  onClick: () => void;
}

const rateOf = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);

// A plain CSS bar chart (no charting library) — same hand-rolled approach as MonthlyTargetCard's
// SVG gauge elsewhere in this app. Each bar is independently clickable so a reviewer can jump
// straight from "Delegation is at 40%" to the filtered list of exactly those items. Every bar is
// coloured by its own rate (rateBarClass), so colour reads as "how well", never as category.
export const CategoryBarChart = ({ bars }: { bars: CategoryBar[] }) => {
  // Every category empty (a new hire, or simply a quiet period): one shared empty state instead of
  // five flat tracks in a mostly blank box.
  if (bars.every(bar => bar.total === 0)) {
    return <EmptyState size="compact" icon={BarChart3} title="No delegations, issues or tickets in this period" />;
  }

  return (
    <>
      {/* Phone: five columns don't fit, so one row per category with a full-width track. */}
      <div className="flex flex-col gap-1 sm:hidden">
        {bars.map(bar => {
          const rate = rateOf(bar.done, bar.total);
          const hasData = bar.total > 0;
          return (
            <button
              key={bar.key}
              type="button"
              onClick={bar.onClick}
              disabled={!hasData}
              className="flex flex-col justify-center gap-1.5 min-h-11 px-2 py-1.5 rounded-lg text-left cursor-pointer outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary-500/40 transition-colors duration-150 ease-out disabled:cursor-default disabled:hover:bg-transparent"
            >
              <span className="flex items-center justify-between gap-2 t-meta font-display">
                <span className={cn('font-medium', hasData ? 'text-text-secondary' : 'text-text-light')}>{bar.label}</span>
                <span className="tabular-nums text-text-muted">{bar.done}/{bar.total}</span>
              </span>
              <span className="relative block h-2 w-full rounded-full bg-border/60 overflow-hidden">
                {hasData && (
                  <span
                    className={cn('absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out', rateBarClass(rate))}
                    style={{ width: `${Math.max(rate, 2)}%` }}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="hidden sm:flex items-stretch justify-between gap-6 min-h-40 px-2">
        {bars.map(bar => {
          const rate = rateOf(bar.done, bar.total);
          const hasData = bar.total > 0;
          return (
            <button
              key={bar.key}
              type="button"
              onClick={bar.onClick}
              disabled={!hasData}
              className="group flex flex-1 flex-col items-center gap-2 rounded-lg cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-default"
            >
              {/* An empty category gets no figure, but keeps the line so every bar starts level. */}
              <span className="t-meta font-display font-medium tabular-nums text-text">
                {hasData ? `${rate}%` : ' '}
              </span>

              {/* A category with nothing recorded gets a short flat track, not a tall empty box that
                  reads as a broken or never-loaded chart. The fill is absolutely positioned so its
                  % height resolves against the track's laid-out height (the chart only has a
                  min-height). */}
              <div className="flex flex-1 flex-col justify-end w-full max-w-14">
                {hasData ? (
                  <div className="relative flex-1 w-full rounded-lg bg-surface-hover overflow-hidden">
                    <div
                      className={cn('absolute inset-x-0 bottom-0 rounded-lg transition-[height,opacity] duration-500 ease-out group-hover:opacity-80', rateBarClass(rate))}
                      style={{ height: `${Math.max(rate, 4)}%` }}
                    />
                  </div>
                ) : (
                  <div className="w-full h-1.5 rounded-full bg-border/60" />
                )}
              </div>

              <span className={cn('t-meta font-display font-medium', hasData ? 'text-text-secondary' : 'text-text-light')}>{bar.label}</span>
              <span className="t-meta font-display text-text-muted tabular-nums">{bar.done}/{bar.total}</span>
            </button>
          );
        })}
      </div>
    </>
  );
};
