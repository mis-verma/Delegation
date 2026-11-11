import { cn } from '@/lib/utils';
import { Skeleton } from '../../components/skeleton';
import { STAT_BAR_SMALL, STAT_FIGURE, STAT_SURFACE, STAT_SURFACE_ACTION, STAT_SURFACE_SELECTED } from '../../components/statSurface';

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

const CELL = cn(STAT_SURFACE, 'flex min-w-0 flex-col justify-center gap-1 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary-500/40');
const CELL_SIZE = 'min-h-16 p-2.5 sm:p-3';
const CELL_SIZE_COMPACT = 'min-h-14 gap-0.5 px-2.5 py-1.5 sm:min-h-16 sm:gap-1 sm:p-2.5';
const CELL_SIZE_PHONE_DENSE = 'min-h-14 gap-0.5 px-2 py-1.5 sm:min-h-16 sm:gap-1 sm:p-3';
const ACTION = STAT_SURFACE_ACTION;

export const FigurePanel = ({ cells, label, loading = false, failed = false, onRetry, phoneColumns = 4, compact = false, phoneDense = false }: FigurePanelProps) => {
  const broken = failed && !loading;
  const cellSize = compact ? CELL_SIZE_COMPACT : phoneDense ? CELL_SIZE_PHONE_DENSE : CELL_SIZE;
  const tightOnPhone = compact || phoneDense;
  return (
    <div className={cn('grid w-full gap-2 sm:grid-cols-4', phoneColumns === 2 ? 'grid-cols-2' : 'grid-cols-4')} role="group" aria-label={label}>
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
            <span className={cn('flex items-center', tightOnPhone ? 'min-h-6 sm:min-h-7' : 'min-h-7')}>
              {loading ? (
                <Skeleton className="h-6 w-12" />
              ) : (
                <span className={cn('t-stat', STAT_FIGURE, broken || cell.value === null ? 'text-text-light' : cell.alert ? 'text-danger' : 'text-text')}>
                  {broken || cell.value === null ? '-' : cell.value}
                </span>
              )}
            </span>
            {!loading && !broken && cell.note && (
              <span className={cn('truncate t-meta', tightOnPhone && 'max-sm:hidden', cell.alert ? 'font-semibold text-danger' : 'text-text-light')}>{cell.note}</span>
            )}
          </>
        );
        if (!interactive) return <div key={cell.key} title={cell.help} className={cn(CELL, cellSize, broken && 'ring-1 ring-danger/30')}>{body}</div>;
        return (
          <button
            key={cell.key}
            type="button"
            onClick={retry ? onRetry : cell.onClick}
            aria-pressed={retry ? undefined : cell.selected}
            aria-label={broken ? `${cell.label}, couldn't load. Tap to try again` : `${cell.label}${cell.value === null ? '' : `, ${cell.value}`}`}
            title={broken ? "Couldn't load. Tap to try again." : cell.help}
            className={cn(CELL, cellSize, ACTION, broken && 'ring-1 ring-danger/30', selected && cn(STAT_SURFACE_SELECTED, STAT_BAR_SMALL))}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
};
