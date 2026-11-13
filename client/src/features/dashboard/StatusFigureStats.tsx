import { cn } from '@/lib/utils';
import { Skeleton } from '../../components/skeleton';
import { STAT_FIGURE, STAT_PHONE_CENTER, STAT_ROW_PHONE_CENTER } from '../../components/statSurface';
import { useStatCountFormat } from '../../lib/statCount';

export type StatusKind = 'pending' | 'completed' | 'due' | 'late' | 'total';

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

const ACCENT: Record<StatusKind, string> = {
  pending: '[--stat-accent:var(--stat-accent-pending)]',
  completed: '[--stat-accent:var(--stat-accent-completed)]',
  due: '[--stat-accent:var(--stat-accent-due)]',
  late: '[--stat-accent:var(--stat-accent-late)]',
  total: '[--stat-accent:var(--stat-accent-pending)]',
};

const CELL = cn(
  'stat-navy relative flex min-h-16 min-w-0 cursor-pointer flex-col justify-center gap-1 overflow-hidden rounded-2xl px-1.5 py-2 text-left outline-none ring-1 ring-inset ring-white/10 touch-manipulation sm:px-2.5',
  STAT_PHONE_CENTER,
  'transition-[transform,filter,box-shadow] duration-200 ease-out hover:brightness-[1.12] active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-white/70',
  'sm:min-h-0 sm:gap-3 sm:p-5',
);

const SELECTED = 'ring-2 ring-white/85 after:pointer-events-none after:absolute after:inset-x-3 after:bottom-0 after:h-1 after:rounded-t-full after:bg-[rgb(var(--stat-accent))] sm:after:inset-x-5';

export const StatusFigureStats = <K extends string>({ items, counts, active, onToggle, isLoading = false, error = false, onRetry, label }: StatusFigureStatsProps<K>) => {
  const failed = error && !isLoading;
  const formatCount = useStatCountFormat();
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
            className={cn(CELL, ACCENT[item.kind], selected && SELECTED)}
          >
            <span className="flex min-w-0 max-w-full flex-col">
              <span className={cn('flex min-w-0 items-center gap-1.5 t-meta font-display font-semibold text-white/80', STAT_ROW_PHONE_CENTER)}>
                <span className={cn('size-1.5 shrink-0 rounded-full bg-[rgb(var(--stat-accent))]', alert && 'live-dot')} aria-hidden="true" />
                <span className="min-w-0 truncate">
                  <span className="sm:hidden">{item.short ?? item.label}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                </span>
              </span>
              {item.note && <span className="truncate t-meta text-white/60">{item.note}</span>}
            </span>
            <span className={cn('flex min-h-7 min-w-0 max-w-full shrink-0 items-center', STAT_ROW_PHONE_CENTER)}>
              {isLoading ? (
                <Skeleton className="h-6 w-12 bg-white/15" />
              ) : (
                <span className={cn('t-stat sm:t-figure', STAT_FIGURE, failed ? 'text-white/45' : alert ? 'text-[rgb(var(--stat-accent))]' : 'text-white')}>
                  {failed ? '-' : formatCount(count)}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
};
