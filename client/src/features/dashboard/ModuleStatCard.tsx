import { memo } from 'react';
import { cn } from '@/lib/utils';
import { useStatCountFormat } from '../../lib/statCount';
import { Skeleton } from '../../components/skeleton';
import { STAT_FIGURE } from '../../components/statSurface';
import { ApprovalPills } from './ApprovalPills';
import { StatLink } from './StatLink';
import { TONE } from './boardLook';
import type { RowTone } from './work/statsRegistry';
import type { BoardColumn, BoardRow } from './boardTypes';

const ROW_BASE = 'relative z-10 -mx-1 flex min-h-8 min-w-0 items-center justify-between gap-2 rounded-md px-1 t-meta outline-none transition-colors duration-150 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary-500/50 pointer-fine:min-h-6';

const COUNT_BY_TONE: Record<RowTone, string> = {
  neutral: 'text-text',
  danger: 'text-danger',
  success: 'text-success',
};

const countClass = (row: BoardRow) => (row.missing || row.value === 0 ? 'text-text-light' : COUNT_BY_TONE[row.tone]);

const RowCount = ({ row }: { row: BoardRow }) =>
  row.loading
    ? <Skeleton className="h-3.5 w-5 shrink-0" />
    : <span className={cn('shrink-0 font-bold tabular-nums', countClass(row))}>{row.missing ? '-' : row.value}</span>;

interface ModuleStatCardProps {
  column: BoardColumn;
  className?: string;
}

const ModuleStatCardComponent = ({ column, className }: ModuleStatCardProps) => {
  const formatCount = useStatCountFormat();
  const Icon = column.icon;
  const tone = TONE[column.tone];

  return (
    <div
      className={cn(
        'relative flex min-h-40 min-w-0 flex-col justify-between gap-2.5 bg-surface p-3 text-left transition-colors duration-150 ease-out hover:bg-surface-hover/60 sm:min-h-44 sm:p-4 2xl:p-5',
        className,
      )}
    >
      <StatLink
        to={column.href}
        aria-label={`${column.label}: ${column.failed ? 'could not load' : column.loading ? 'loading' : column.total}. ${column.totalLabel}`}
        className="absolute inset-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/50"
      />

      <span className="pointer-events-none inline-flex min-w-0 max-w-full items-center gap-1.5">
        <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-md text-white', tone.tile)} aria-hidden="true">
          <Icon size={12} strokeWidth={2.75} />
        </span>
        <span className="min-w-0 truncate t-meta font-display font-semibold text-text-secondary">{column.label}</span>
      </span>

      <span className="flex min-w-0 flex-col gap-0.5">
        {column.rows.map((row) => (
          <StatLink
            key={row.key}
            to={row.href}
            aria-label={`${column.label}, ${row.label}: ${row.loading ? 'loading' : row.missing ? 'could not load' : row.value}. Open`}
            className={ROW_BASE}
          >
            <span className="min-w-0 truncate text-text-muted">{row.label}</span>
            <RowCount row={row} />
          </StatLink>
        ))}
      </span>

      {column.pills && column.pills.length > 0 && (
        <span className="border-t border-border/60 pt-2">
          <ApprovalPills parts={column.pills} missing={column.failed} />
        </span>
      )}

      <span className="pointer-events-none flex min-w-0 max-w-full flex-col gap-0.5">
        {column.loading
          ? <Skeleton className="h-7 w-10" />
          : <span className={cn('t-stat', STAT_FIGURE, column.total > 0 ? tone.value : 'text-text')}>{column.failed ? '-' : formatCount(column.total)}</span>}
        <span className="t-meta text-text-muted line-clamp-2">{column.totalLabel}</span>
      </span>
    </div>
  );
};

export const ModuleStatCard = memo(ModuleStatCardComponent);
