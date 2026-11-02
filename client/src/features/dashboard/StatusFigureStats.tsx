import { cn } from '@/lib/utils';
import { Skeleton } from '../../components/skeleton';

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

const CELL = 'flex min-h-16 min-w-0 cursor-pointer flex-col justify-center gap-1 bg-surface px-4 py-2.5 text-left outline-none transition-colors duration-150 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40 sm:min-h-24 sm:px-6 sm:py-4';

export const StatusFigureStats = <K extends string>({ items, counts, active, onToggle, isLoading = false, error = false, onRetry, label }: StatusFigureStatsProps<K>) => {
  const failed = error && !isLoading;
  return (
    <div className="grid w-full grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4" role="group" aria-label={label}>
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
            className={cn(CELL, selected && 'bg-surface-hover shadow-[inset_0_-3px_0_var(--color-gold)] ring-2 ring-inset ring-primary-800')}
          >
            <span className="min-w-0 truncate t-meta font-display font-semibold text-text-muted">
              <span className="sm:hidden">{item.short ?? item.label}{item.note ? ` · ${item.note.toLowerCase()}` : ""}</span>
              <span className="hidden sm:inline">{item.label}</span>
            </span>
            <span className="flex min-h-8 items-center sm:min-h-11">
              {isLoading ? (
                <Skeleton className="h-7 w-14" />
              ) : (
                <span className={cn('font-display text-2xl font-bold leading-none tabular-nums sm:text-4xl', failed ? 'text-text-light' : alert ? 'text-danger' : 'text-text')}>
                  {failed ? '-' : count}
                </span>
              )}
            </span>
            {item.note && <span className="hidden truncate t-meta text-text-light sm:block">{item.note}</span>}
          </button>
        );
      })}
    </div>
  );
};
