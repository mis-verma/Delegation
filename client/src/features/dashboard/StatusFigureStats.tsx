import { cn } from '@/lib/utils';
import { Skeleton } from '../../components/skeleton';
import { STAT_FIGURE, STAT_PHONE_CENTER, STAT_ROW_PHONE_CENTER, STAT_SURFACE, STAT_SURFACE_ACTION, STAT_SURFACE_SELECTED } from '../../components/statSurface';
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
  display?: Partial<Record<K, string>>;
  total?: number;
  active?: K | null;
  onToggle?: (key: K) => void;
  isLoading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  label: string;
  phoneColumns?: 2 | 4;
  surface?: 'navy' | 'light';
}

const ACCENT: Record<StatusKind, string> = {
  pending: '[--stat-accent:var(--stat-accent-pending)]',
  completed: '[--stat-accent:var(--stat-accent-completed)]',
  due: '[--stat-accent:var(--stat-accent-due)]',
  late: '[--stat-accent:var(--stat-accent-late)]',
  total: '[--stat-accent:var(--stat-accent-pending)]',
};

const CELL_BASE = cn(
  'relative flex min-h-16 min-w-0 cursor-pointer flex-col justify-center gap-1 overflow-hidden rounded-2xl px-1.5 py-2 text-left outline-none touch-manipulation sm:px-2.5 sm:min-h-0 sm:gap-3 sm:p-5',
  STAT_PHONE_CENTER,
);

const CELL_NAVY = cn(
  CELL_BASE,
  'stat-navy ring-1 ring-inset ring-white/10',
  'transition-[transform,filter,box-shadow] duration-200 ease-out hover:brightness-[1.12] active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-white/70',
);

const CELL_LIGHT = cn(
  CELL_BASE,
  STAT_SURFACE, STAT_SURFACE_ACTION,
  'focus-visible:ring-2 focus-visible:ring-primary-500/40',
);

const STATIC_NAVY = 'cursor-default hover:brightness-100 active:scale-100';
const STATIC_LIGHT = 'cursor-default hover:bg-surface active:scale-100';

const SELECTED_NAVY = 'ring-2 ring-white/85 after:pointer-events-none after:absolute after:inset-x-3 after:bottom-0 after:h-1 after:rounded-t-full after:bg-[rgb(var(--stat-accent))] sm:after:inset-x-5';
const SELECTED_LIGHT = cn(STAT_SURFACE_SELECTED, 'after:pointer-events-none after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[rgb(var(--stat-accent))] sm:after:inset-x-5');

const GRID_BY_COUNT: Record<number, string> = {
  4: 'grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-5 [&>:last-child]:max-sm:col-span-2',
};

const gridClass = (count: number, phoneColumns: 2 | 4): string => {
  if (count === 4 && phoneColumns === 2) return 'grid-cols-2 sm:grid-cols-4';
  return GRID_BY_COUNT[count] ?? GRID_BY_COUNT[4];
};

export const StatusFigureStats = <K extends string>({ items, counts, display, active, onToggle, isLoading = false, error = false, onRetry, label, phoneColumns = 4, surface = 'navy' }: StatusFigureStatsProps<K>) => {
  const failed = error && !isLoading;
  const formatCount = useStatCountFormat();
  const light = surface === 'light';
  const cell = light ? CELL_LIGHT : CELL_NAVY;
  const staticCell = light ? STATIC_LIGHT : STATIC_NAVY;
  const selectedCell = light ? SELECTED_LIGHT : SELECTED_NAVY;
  const labelTone = light ? 'text-text-muted' : 'text-white/80';
  const noteTone = light ? 'text-text-light' : 'text-white/60';
  const figureTone = light ? 'text-text' : 'text-white';
  const figureFailedTone = light ? 'text-text-light' : 'text-white/45';
  return (
    <div className={cn('grid w-full gap-1.5 sm:gap-2', gridClass(items.length, phoneColumns))} role="group" aria-label={label}>
      {items.map((item) => {
        const count = counts[item.key] ?? 0;
        const shown = display?.[item.key] ?? formatCount(count);
        const selected = active === item.key && !failed;
        const alert = item.kind === 'late' && count > 0 && !failed && !isLoading;
        const retry = failed && !!onRetry;
        const body = (
          <>
            <span className="flex min-w-0 max-w-full flex-col">
              <span className={cn('flex min-w-0 items-center gap-1.5 t-meta font-display font-semibold', labelTone, STAT_ROW_PHONE_CENTER)}>
                <span className={cn('size-1.5 shrink-0 rounded-full bg-[rgb(var(--stat-accent))]', alert && 'live-dot')} aria-hidden="true" />
                <span className="min-w-0 truncate">
                  <span className="sm:hidden">{item.short ?? item.label}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                </span>
              </span>
              {item.note && <span className={cn('truncate t-meta', noteTone)}>{item.note}</span>}
            </span>
            <span className={cn('flex min-h-7 min-w-0 max-w-full shrink-0 items-center', STAT_ROW_PHONE_CENTER)}>
              {isLoading ? (
                <Skeleton className={cn('h-6 w-12', !light && 'bg-white/15')} />
              ) : (
                <span className={cn('t-stat sm:t-figure', STAT_FIGURE, failed ? figureFailedTone : alert ? 'text-[rgb(var(--stat-accent))]' : figureTone)}>
                  {failed ? '-' : shown}
                </span>
              )}
            </span>
          </>
        );
        if (!retry && !onToggle) {
          return (
            <div key={item.key} title={item.help} className={cn(cell, staticCell, ACCENT[item.kind])}>
              <span className="sr-only">{isLoading ? item.label : `${item.label}, ${shown}`}</span>
              <span aria-hidden="true" className="contents">{body}</span>
            </div>
          );
        }
        return (
          <button
            key={item.key}
            type="button"
            onClick={retry ? onRetry : () => onToggle?.(item.key)}
            aria-pressed={retry ? undefined : selected}
            aria-label={failed ? `${item.label}, couldn't load. Tap to try again` : isLoading ? item.label : `${item.label}, ${shown}`}
            title={failed ? "Couldn't load. Tap to try again." : item.help}
            className={cn(cell, ACCENT[item.kind], selected && selectedCell)}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
};
