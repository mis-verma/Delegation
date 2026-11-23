import { AlertTriangle, CheckCheck, Clock3, Hourglass, ListChecks, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '../../components/skeleton';
import { STAT_FIGURE } from '../../components/statSurface';
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
  /** Accepted so callers can pass a denominator; the cards show counts on their own. */
  total?: number;
  active?: K | null;
  onToggle?: (key: K) => void;
  isLoading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  label: string;
}

interface KindLook {
  icon: LucideIcon;
  /** The solid square the icon sits on, the one piece of colour in the card. */
  tile: string;
  /** Border and wash once this one is the active filter. */
  selected: string;
  /** The bar under a selected card. Written out in full, so Tailwind can see it. */
  bar: string;
}

/** One row per status, read once per card, so nothing here needs a branch. */
const LOOK: Readonly<Record<StatusKind, KindLook>> = {
  pending: { icon: Clock3, tile: 'bg-primary-600', selected: 'border-primary-500/45 bg-primary-500/[0.06]', bar: 'after:bg-primary-600' },
  due: { icon: Hourglass, tile: 'bg-warning', selected: 'border-warning/50 bg-warning/[0.07]', bar: 'after:bg-warning' },
  late: { icon: AlertTriangle, tile: 'bg-danger', selected: 'border-danger/50 bg-danger/[0.06]', bar: 'after:bg-danger' },
  completed: { icon: CheckCheck, tile: 'bg-success', selected: 'border-success/50 bg-success/[0.07]', bar: 'after:bg-success' },
  total: { icon: ListChecks, tile: 'bg-text-muted', selected: 'border-primary-500/45 bg-primary-500/[0.06]', bar: 'after:bg-primary-600' },
};

const CARD = cn(
  'relative flex min-w-0 items-center gap-2.5 overflow-hidden rounded-xl border border-border bg-surface p-2.5 text-left',
  'transition-[background-color,border-color] duration-150 ease-out sm:gap-3 sm:p-3.5',
);

const CARD_ACTION = 'cursor-pointer touch-manipulation outline-none hover:border-border-hover hover:bg-surface-hover active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40';

const SELECTED_BAR = 'after:pointer-events-none after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full sm:after:inset-x-4';

/** Five never divides into a phone's two columns, so the last one takes the spare half. */
const GRID: Readonly<Record<number, string>> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3 [&>:last-child]:max-sm:col-span-2',
  4: 'grid-cols-2 sm:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 [&>:last-child]:max-sm:col-span-2',
};

const gridClass = (count: number): string => GRID[count] ?? 'grid-cols-2 sm:grid-cols-4';

export const StatusFigureStats = <K extends string>({
  items, counts, display, active, onToggle, isLoading = false, error = false, onRetry, label,
}: StatusFigureStatsProps<K>) => {
  const failed = error && !isLoading;
  const formatCount = useStatCountFormat();

  return (
    <div className={cn('grid w-full gap-2', gridClass(items.length))} role="group" aria-label={label}>
      {items.map((item) => {
        const look = LOOK[item.kind];
        const Icon = look.icon;
        const count = counts[item.key] ?? 0;
        const shown = display?.[item.key] ?? formatCount(count);
        const selected = active === item.key && !failed;
        const alert = item.kind === 'late' && count > 0 && !failed && !isLoading;
        const retry = failed && !!onRetry;

        const body = (
          <>
            <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg text-white sm:size-9', look.tile, alert && 'live-dot')} aria-hidden="true">
              <Icon size={15} strokeWidth={2.5} />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="min-w-0 truncate t-meta font-display font-semibold text-text-secondary">
                <span className="sm:hidden">{item.short ?? item.label}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </span>
              {isLoading ? (
                <Skeleton className="h-6 w-10" />
              ) : (
                <span className={cn('t-section sm:t-stat', STAT_FIGURE, failed ? 'text-text-light' : alert ? 'text-danger' : 'text-text')}>
                  {failed ? '-' : shown}
                </span>
              )}
              {item.note && <span className="truncate t-meta text-text-light">{item.note}</span>}
            </span>
          </>
        );

        if (!retry && !onToggle) {
          return (
            <div key={item.key} title={item.help} className={CARD}>
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
            className={cn(CARD, CARD_ACTION, selected && cn(look.selected, SELECTED_BAR, look.bar))}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
};
