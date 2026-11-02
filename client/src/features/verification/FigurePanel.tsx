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
}

const CELL = 'flex min-h-20 min-w-0 flex-col justify-center gap-0.5 rounded-xl bg-surface-hover/60 px-2.5 py-2.5 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40 sm:min-h-24 sm:gap-1 sm:px-6 sm:py-4';

export const FigurePanel = ({ cells, label, loading = false, failed = false, onRetry }: FigurePanelProps) => {
  const broken = failed && !loading;
  return (
    <div className="grid w-full grid-cols-4 gap-1.5 sm:gap-2" role="group" aria-label={label}>
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
            <span className="flex min-h-9 items-center sm:min-h-11">
              {loading ? (
                <Skeleton className="h-7 w-14" />
              ) : (
                <span className={cn('font-display font-bold leading-none tabular-nums sm:text-4xl', typeof cell.value === 'string' || (cell.value ?? 0) < 1000 ? 'text-3xl' : 'text-2xl', broken || cell.value === null ? 'text-text-light' : cell.alert ? 'text-danger' : 'text-text')}>
                  {broken || cell.value === null ? '-' : cell.value}
                </span>
              )}
            </span>
            {!loading && !broken && cell.note && (
              <span className={cn('truncate t-meta', cell.alert ? 'font-semibold text-danger' : 'text-text-light')}>{cell.note}</span>
            )}
          </>
        );
        if (!interactive) return <div key={cell.key} title={cell.help} className={CELL}>{body}</div>;
        return (
          <button
            key={cell.key}
            type="button"
            onClick={retry ? onRetry : cell.onClick}
            aria-pressed={retry ? undefined : cell.selected}
            aria-label={broken ? `${cell.label}, couldn't load. Tap to try again` : `${cell.label}${cell.value === null ? '' : `, ${cell.value}`}`}
            title={broken ? "Couldn't load. Tap to try again." : cell.help}
            className={cn(CELL, 'cursor-pointer hover:bg-surface-hover', selected && 'bg-primary-500/10 shadow-[inset_0_-3px_0_var(--color-gold)]')}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
};
