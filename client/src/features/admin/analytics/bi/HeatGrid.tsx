import { useMemo, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import type { MatrixCell, MatrixResponse } from '../../../../api/scores';
import { formatPct, roundPct } from '../../../../lib/percent';
import { HEAT_KEY, heatFill, heatLook } from '../../../../lib/heatScale';
import { bucketShortLabel, bucketTitle, PERIOD_NOUN } from './biTimeUtils';
import { cellDue, cellValue, measureLabel, moduleTitle, type BiMeasure, type BiModule, type DetailRow } from './biMetrics';

interface HeatRow extends DetailRow {
  cells: (MatrixCell | null)[];
}

interface HeatGridProps {
  matrix: MatrixResponse;
  module: BiModule;
  measure: BiMeasure;
  lowestFirst: boolean;
  totalLabel: string;
  maxRows?: number;
  showTotal?: boolean;
  onOpen: (row: DetailRow, bucketIndex: number | null) => void;
}

export const HeatGrid = ({ matrix, module, measure, lowestFirst, totalLabel, maxRows, showTotal = true, onOpen }: HeatGridProps) => {
  const { period, buckets } = matrix;

  const rows = useMemo<HeatRow[]>(() => {
    const sorted = [...matrix.rows].sort((a, b) => {
      const x = cellValue(a.whole, module, measure);
      const y = cellValue(b.whole, module, measure);
      if (x === null && y === null) return a.name.localeCompare(b.name);
      if (x === null) return 1;
      if (y === null) return -1;
      return (lowestFirst ? x - y : y - x) || cellDue(b.whole, module) - cellDue(a.whole, module) || a.name.localeCompare(b.name);
    }).filter((r) => cellValue(r.whole, module, measure) !== null).slice(0, maxRows ?? Infinity);
    const total: HeatRow = { id: 'total', name: totalLabel, kind: 'total', whole: matrix.total.whole, cells: matrix.total.cells };
    return showTotal ? [total, ...sorted] : sorted;
  }, [matrix, module, measure, lowestFirst, totalLabel, maxRows, showTotal]);

  const noun = PERIOD_NOUN[period];
  const weekday = (day: string) => ['S', 'M', 'T', 'W', 'T', 'F', 'S'][new Date(`${day}T00:00:00Z`).getUTCDay()] ?? '';

  const move = (e: KeyboardEvent<HTMLTableElement>) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-cell]');
    if (!target || !['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const [r, c] = (target.dataset.cell ?? '').split(':').map(Number);
    const nr = r + (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0);
    const nc = c + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0);
    const next = e.currentTarget.querySelector<HTMLElement>(`[data-cell="${nr}:${nc}"]`);
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto overscroll-x-contain rounded-2xl ring-1 ring-inset ring-border/50">
        <table onKeyDown={move} className="w-full border-separate border-spacing-0">
          <caption className="sr-only">{moduleTitle(module)} {measureLabel(measure, module).toLowerCase()} by {noun}, one row per name. Pick a name or a box to open its details.</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 w-36 min-w-32 border-b border-border/40 bg-surface px-3 py-2 text-left t-meta font-display font-semibold text-text-muted sm:w-52 sm:min-w-44">Name</th>
              {buckets.map((b, i) => (
                <th key={i} scope="col" title={bucketTitle(period, b)} className="border-b border-border/40 px-0.5 py-2 text-center">
                  <span className="flex flex-col items-center gap-0.5 leading-none">
                    {period === 'day' && <span className="t-meta font-display font-medium text-text-light">{weekday(b.from)}</span>}
                    <span className="t-meta font-display font-semibold tabular-nums text-text-secondary">{bucketShortLabel(period, b)}</span>
                  </span>
                </th>
              ))}
              <th scope="col" className="border-b border-l border-border/40 px-2 py-2 text-center t-meta font-display font-semibold text-text-secondary">Overall</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => {
              const isTotal = row.id === 'total';
              const overall = roundPct(cellValue(row.whole, module, measure));
              return (
              <tr key={row.id} className={cn(isTotal && 'bg-surface-hover/40')}>
                <th scope="row" className={cn('sticky left-0 z-10 w-36 min-w-32 px-1 py-0.5 text-left sm:w-52 sm:min-w-44', isTotal ? 'border-b-2 border-border/70 bg-surface-hover' : 'border-b border-border/30 bg-surface')}>
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-label={`${row.name}: open the details`}
                    onClick={() => onOpen(row, null)}
                    className="min-h-9 w-full rounded-md px-2 text-left outline-none cursor-pointer hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary-500/50 pointer-coarse:min-h-11"
                  >
                    <span className={cn('line-clamp-2 t-meta font-display leading-snug text-text', isTotal ? 'font-extrabold' : 'font-semibold')}>{row.name}</span>
                  </button>
                </th>
                {row.cells.map((cell, c) => {
                  const value = roundPct(cellValue(cell, module, measure));
                  const bucket = buckets[c];
                  return (
                    <td key={c} className={cn('p-1', isTotal ? 'border-b-2 border-border/70' : 'border-b border-border/30')}>
                      <button
                        type="button"
                        data-cell={`${r}:${c}`}
                        aria-haspopup="dialog"
                        aria-label={`${row.name}, ${bucket ? bucketTitle(period, bucket) : ''}: ${value === null ? 'nothing due' : formatPct(value)}. Open the details.`}
                        onClick={() => onOpen(row, c)}
                        style={value === null ? undefined : heatLook(value)}
                        className={cn(
                          'flex h-9 w-full min-w-8 items-center justify-center rounded-md t-meta font-display font-semibold tabular-nums outline-none cursor-pointer transition-[opacity,transform] duration-150 hover:opacity-85 active:scale-[0.96] sm:h-10 pointer-coarse:h-11',
                          'focus-visible:ring-2 focus-visible:ring-primary-500/60',
                          value === null && 'bg-surface-hover/40 text-text-light',
                        )}
                      >
                        {value === null ? <span className="size-1 rounded-full bg-current" aria-hidden="true" /> : Math.round(value)}
                      </button>
                    </td>
                  );
                })}
                <td className={cn('border-l border-border/40 px-2 py-1', isTotal ? 'border-b-2 border-b-border/70' : 'border-b border-b-border/30')}>
                  <span
                    style={overall === null ? undefined : heatLook(overall)}
                    className={cn('flex h-9 min-w-12 items-center justify-center rounded-full px-2 t-meta font-display font-bold tabular-nums sm:h-10', overall === null && 'text-text-light')}
                  >
                    {overall === null ? '-' : `${Math.round(overall)}%`}
                  </span>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 t-meta font-medium text-text-muted" aria-label="Colour key">
        <span className="font-display font-semibold text-text-secondary">Score</span>
        {HEAT_KEY.map(({ level, label }) => (
          <span key={level} className="inline-flex items-center gap-1.5">
            <span className="size-3.5 rounded-md" style={{ background: heatFill(level) }} aria-hidden="true" />
            {label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="flex size-3.5 items-center justify-center rounded-md bg-surface-hover/60 text-text-light" aria-hidden="true"><span className="size-1 rounded-full bg-current" /></span>
          Nothing due
        </span>
        {matrix.truncated && <span>Showing the 30 busiest rows.</span>}
        <span className="basis-full">Each box is one {noun}. Tap it for details.</span>
      </div>
    </div>
  );
};
