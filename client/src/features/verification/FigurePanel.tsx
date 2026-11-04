import { cn } from '@/lib/utils';
import { Skeleton } from '../../components/skeleton';

export interface FigureCell {
  key: string;
  label: string;
  short?: string;
  value: number | string | null;
  note?: string;
  alert?: boolean;
  help: string;
  selected?: boolean;
  onClick?: () => void;
}

interface FigurePanelProps {
  cells: readonly FigureCell[];
  label: string;
  loading?: boolean;
  failed?: boolean;
  onRetry?: () => void;
  phoneColumns?: 2 | 4;
  compact?: boolean;
  phoneDense?: boolean;
}

const CELL = 'flex min-w-0 flex-col justify-center gap-0.5 rounded-xl bg-surface text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40';
const CELL_SIZE = 'min-h-20 px-2.5 py-2.5 sm:min-h-24 sm:gap-1 sm:px-6 sm:py-4';
const CELL_SIZE_COMPACT = 'min-h-16 px-3 py-2 sm:min-h-[4.5rem] sm:px-4 sm:py-3';
const CELL_SIZE_PHONE_DENSE = 'min-h-14 px-2 py-1.5 sm:min-h-24 sm:gap-1 sm:px-6 sm:py-4';

const valueClass = (compact: boolean, phoneDense: boolean, value: number | string | null) => {
  if (compact) return 'text-2xl sm:text-3xl';
  if (phoneDense) return 't-stat sm:text-4xl';
  return cn('sm:text-4xl', typeof value === 'string' || (value ?? 0) < 1000 ? 'text-3xl' : 'text-2xl');
};

export const FigurePanel = ({ cells, label, loading = false, failed = false, onRetry, phoneColumns = 4, compact = false, phoneDense = false }: FigurePanelProps) => {
  const broken = failed && !loading;
  const cellSize = compact ? CELL_SIZE_COMPACT : phoneDense ? CELL_SIZE_PHONE_DENSE : CELL_SIZE;
  return (
    <div className={cn('grid w-full gap-1.5 sm:grid-cols-4 sm:gap-2', phoneColumns === 2 ? 'grid-cols-2' : 'grid-cols-4')} role="group" aria-label={label}>
      {cells.map((cell) => {
        const retry = broken && !!onRetry;
        const interactive = retry || !!cell.onClick;
        const selected = !!cell.selected && !broken;
        const body = (
          <>
            <span className="min-w-0 truncate t-meta font-display font-semibold text-text-muted">
              <span className="sm:hidden">{cell.short ?? cell.label}</span>
              <span className="hidden sm:inline">{cell.label}</span>
            </span>
            <span className={cn('flex items-center', compact ? 'min-h-7 sm:min-h-8' : phoneDense ? 'min-h-6 sm:min-h-11' : 'min-h-9 sm:min-h-11')}>
              {loading ? (
                <Skeleton className={cn('w-14', phoneDense ? 'h-5 sm:h-7' : 'h-7')} />
              ) : (
                <span className={cn('font-display font-bold leading-none tabular-nums', valueClass(compact, phoneDense, cell.value), broken || cell.value === null ? 'text-text-light' : cell.alert ? 'text-danger' : 'text-text')}>
                  {broken || cell.value === null ? '-' : cell.value}
                </span>
              )}
            </span>
            {!loading && !broken && cell.note && (
              <span className={cn('truncate t-meta', phoneDense && 'max-sm:hidden', cell.alert ? 'font-semibold text-danger' : 'text-text-light')}>{cell.note}</span>
            )}
          </>
        );
        if (!interactive) return <div key={cell.key} title={cell.help} className={cn(CELL, cellSize)}>{body}</div>;
        return (
          <button
            key={cell.key}
            type="button"
            onClick={retry ? onRetry : cell.onClick}
            aria-pressed={retry ? undefined : cell.selected}
            aria-label={broken ? `${cell.label}, couldn't load. Tap to try again` : `${cell.label}${cell.value === null ? '' : `, ${cell.value}`}`}
            title={broken ? "Couldn't load. Tap to try again." : cell.help}
            className={cn(CELL, cellSize, 'cursor-pointer hover:bg-surface-hover', selected && 'bg-primary-500/15 shadow-[inset_0_-3px_0_var(--color-gold)]')}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
};
