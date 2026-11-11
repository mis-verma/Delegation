import { cn } from '@/lib/utils';
import { Skeleton } from '../../components/skeleton';
import { STAT_BAR_SMALL, STAT_FIGURE, STAT_SURFACE, STAT_SURFACE_ACTION, STAT_SURFACE_SELECTED } from '../../components/statSurface';

export type StatusKind = 'pending' | 'completed' | 'due' | 'late';

export interface StatusFigureItem<K extends string> {
  key: K;
  kind: StatusKind;
  label: string;
  short?: string;
  help: string;
  note?: string;
}

interface StatusFigureStatsProps<K extends string> {
  items: readonly StatusFigureItem<K>[];
  counts: Record<K, number>;
  total?: number;
  active: K | null;
  onToggle: (key: K) => void;
  isLoading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  label: string;
}

const CELL = cn(STAT_SURFACE, STAT_SURFACE_ACTION, 'flex min-h-16 min-w-0 flex-col justify-center gap-1 px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40 sm:min-h-14 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4 sm:py-2.5');

export const StatusFigureStats = <K extends string>({ items, counts, active, onToggle, isLoading = false, error = false, onRetry, label }: StatusFigureStatsProps<K>) => {
  const failed = error && !isLoading;
  return (
    <div className="grid w-full grid-cols-4 gap-1.5 sm:gap-2" role="group" aria-label={label}>
      {items.map((item) => {
        const count = counts[item.key] ?? 0;
        const selected = active === item.key && !failed;
        const alert = item.kind === 'late' && count > 0 && !failed && !isLoading;
        const retry = failed && !!onRetry;
        return (
          <button
            key={item.key}
            type="button"
            onClick={retry ? onRetry : () => onToggle(item.key)}
            aria-pressed={retry ? undefined : selected}
            aria-label={failed ? `${item.label}, couldn't load. Tap to try again` : isLoading ? item.label : `${item.label}, ${count}`}
            title={failed ? "Couldn't load. Tap to try again." : item.help}
            className={cn(CELL, selected && cn(STAT_SURFACE_SELECTED, STAT_BAR_SMALL))}
          >
            <span className="flex min-w-0 flex-col">
              <span className="min-w-0 truncate t-meta font-display font-semibold text-text-muted">
                <span className="sm:hidden">{item.short ?? item.label}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </span>
              {item.note && <span className="truncate t-meta text-text-light">{item.note}</span>}
            </span>
            <span className="flex min-h-7 shrink-0 items-center">
              {isLoading ? (
                <Skeleton className="h-6 w-12" />
              ) : (
                <span className={cn('t-stat', STAT_FIGURE, failed ? 'text-text-light' : alert ? 'text-danger' : 'text-text')}>
                  {failed ? '-' : count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
};
