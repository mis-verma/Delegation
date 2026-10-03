import { BarChart3 } from 'lucide-react';

export interface CategoryBar {
  key: string;
  label: string;
  done: number;
  total: number;
  barClassName: string;
  onClick: () => void;
}

const rateOf = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);

// A plain CSS bar chart (no charting library) — same hand-rolled approach as MonthlyTargetCard's
// SVG gauge elsewhere in this app. Each bar is independently clickable so a reviewer can jump
// straight from "Delegation is at 40%" to the filtered list of exactly those items.
export const CategoryBarChart = ({ bars }: { bars: CategoryBar[] }) => {
  // Every category empty (a new hire, or simply a quiet period) used to render as five flat lines
  // sitting in a mostly-empty h-48 box — technically no longer the "broken chart" look a blank
  // rounded-lg box gave, but still a lot of dead space for "nothing happened here yet." One
  // centered message says the same thing without the five repeated dashes.
  if (bars.every(bar => bar.total === 0)) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-48 rounded-lg bg-surface-hover/40 border border-dashed border-border/70 text-center px-4">
        <span className="flex items-center justify-center size-9 rounded-full bg-surface text-text-light border border-border/60">
          <BarChart3 size={16} strokeWidth={2} />
        </span>
        <p className="text-xs font-display font-semibold text-text-muted">No delegation, issue, or ticket activity in this period</p>
        <p className="text-xs font-display text-text-muted max-w-xs">
          Once some is created, it breaks down by type here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-end justify-between gap-4 sm:gap-6 h-48 px-2">
      {bars.map(bar => {
        const rate = rateOf(bar.done, bar.total);
        const hasData = bar.total > 0;
        return (
          <button
            key={bar.key}
            type="button"
            onClick={bar.onClick}
            disabled={!hasData}
            className="group flex flex-1 flex-col items-center gap-2 h-full cursor-pointer outline-none disabled:cursor-default"
          >
            <span className={`text-xs font-display font-medium tabular-nums ${hasData ? 'text-text' : 'text-text-light'}`}>
              {hasData ? `${rate}%` : 'n/a'}
            </span>

            {/* A category with nothing recorded gets a short flat track, not the same tall empty
                rounded-lg box a real bar sits in — at h-48 with 4-5 categories, "no data" rendered
                as a full-height blank rectangle read as a broken/never-loaded chart rather than an
                intentional empty state. */}
            <div className="relative flex-1 w-full max-w-14 flex items-end justify-center">
              {hasData ? (
                <div className="relative w-full h-full rounded-lg bg-surface-hover overflow-hidden flex items-end">
                  <div
                    className={`w-full rounded-lg transition-all duration-500 ease-out group-hover:opacity-80 group-focus-visible:ring-2 group-focus-visible:ring-primary-500/40 ${bar.barClassName}`}
                    style={{ height: `${Math.max(rate, 4)}%` }}
                  />
                </div>
              ) : (
                <div className="w-full h-1.5 rounded-full bg-border/60 mb-0.5" />
              )}
            </div>

            <span className={`text-xs font-display font-medium ${hasData ? 'text-text-secondary' : 'text-text-light'}`}>{bar.label}</span>
            <span className="text-xs font-display text-text-muted tabular-nums">{bar.done}/{bar.total}</span>
          </button>
        );
      })}
    </div>
  );
};
