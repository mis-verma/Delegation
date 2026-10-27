import { useMemo, useState, type KeyboardEvent } from 'react';
import { ZoomIn } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExplorerRow, ExplorerRowKind, ExplorerView, MatrixBucket, MatrixCell, MatrixResponse } from '../../../../api/scores';
import { drillTargets } from '../../../scores/scoresDisplay';
import { Button } from '../../../../components';
import { formatPct, roundPct } from '../../../../lib/percent';
import { MODULE_LABEL } from '../../../../lib/scoreLabels';
import { FAIR_FROM, GOOD_FROM } from '../../../../lib/scoreBands';
import { TONE_COLOR, toneOf } from '../../../dashboard/scoreTone';
import { bucketShortLabel, bucketTitle, PERIOD_NOUN } from './biTimeUtils';
import { BI_MODULES, cellDue, cellValue, measureLabel, moduleTitle, type BiMeasure, type BiModule } from './biMetrics';

const heatBackground = (value: number): string => {
  const tone = toneOf(value);
  const strength = tone === 'danger'
    ? 0.6 - 0.3 * (value / FAIR_FROM)
    : tone === 'warning'
      ? 0.25 + 0.1 * ((value - FAIR_FROM) / (GOOD_FROM - FAIR_FROM))
      : 0.25 + 0.35 * ((value - GOOD_FROM) / (100 - GOOD_FROM));
  return `color-mix(in srgb, ${TONE_COLOR[tone]} ${Math.round(strength * 100)}%, transparent)`;
};

interface HeatRow {
  id: string;
  name: string;
  kind: ExplorerRowKind;
  whole: MatrixCell;
  cells: (MatrixCell | null)[];
}

interface HeatGridProps {
  matrix: MatrixResponse;
  module: BiModule;
  measure: BiMeasure;
  lowestFirst: boolean;
  totalLabel: string;
  onZoom: (bucket: MatrixBucket) => void;
  onDrill: (row: Pick<ExplorerRow, 'id' | 'name' | 'kind'>, view: ExplorerView) => void;
}

export const HeatGrid = ({ matrix, module, measure, lowestFirst, totalLabel, onZoom, onDrill }: HeatGridProps) => {
  const { period, buckets } = matrix;
  const [picked, setPicked] = useState<{ rowId: string; index: number } | null>(null);

  const rows = useMemo<HeatRow[]>(() => {
    const sorted = [...matrix.rows].sort((a, b) => {
      const x = cellValue(a.whole, module, measure);
      const y = cellValue(b.whole, module, measure);
      if (x === null && y === null) return a.name.localeCompare(b.name);
      if (x === null) return 1;
      if (y === null) return -1;
      return (lowestFirst ? x - y : y - x) || cellDue(b.whole, module) - cellDue(a.whole, module) || a.name.localeCompare(b.name);
    }).filter((r) => cellValue(r.whole, module, measure) !== null);
    return [{ id: 'total', name: totalLabel, kind: 'total' as const, whole: matrix.total.whole, cells: matrix.total.cells }, ...sorted];
  }, [matrix, module, measure, lowestFirst, totalLabel]);

  const noun = PERIOD_NOUN[period];
  const selectedRow = picked ? rows.find((r) => r.id === picked.rowId) ?? null : null;
  const selectedCell = selectedRow && picked ? selectedRow.cells[picked.index] ?? null : null;
  const selectedBucket = picked ? buckets[picked.index] : undefined;

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

  const modules = module === 'all' ? BI_MODULES : [module];

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-border/60">
        <table onKeyDown={move} className="border-separate border-spacing-0">
          <caption className="sr-only">{moduleTitle(module)} {measureLabel(measure, module).toLowerCase()} by {noun}, one row per name</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 min-w-32 max-w-40 border-b border-border/60 bg-surface px-3 py-2 text-left t-meta font-display font-semibold text-text-muted sm:min-w-44 sm:max-w-56">Name</th>
              {buckets.map((b, i) => (
                <th key={i} scope="col" title={bucketTitle(period, b)} className="border-b border-border/60 px-0.5 py-2 text-center t-meta font-display font-semibold text-text-muted">
                  {bucketShortLabel(period, b)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={row.id}>
                <th scope="row" className="sticky left-0 z-10 min-w-32 max-w-40 border-b border-border/40 bg-surface px-3 py-0.5 text-left sm:min-w-44 sm:max-w-56">
                  {(() => {
                    const target = drillTargets(row)[0];
                    const text = <span className={cn('line-clamp-2 t-meta font-display leading-snug', row.id === 'total' ? 'font-extrabold text-text' : 'font-semibold text-text')}>{row.name}</span>;
                    return target ? (
                      <button
                        type="button"
                        onClick={() => onDrill(row, target.view)}
                        aria-label={`${row.name}: ${target.label.toLowerCase()}`}
                        className="min-h-9 w-full rounded-md text-left outline-none cursor-pointer hover:text-primary-700 focus-visible:ring-2 focus-visible:ring-primary-500/50 pointer-coarse:min-h-11 dark:hover:text-primary-300"
                      >
                        {text}
                      </button>
                    ) : text;
                  })()}
                </th>
                {row.cells.map((cell, c) => {
                  const value = roundPct(cellValue(cell, module, measure));
                  const isPicked = picked?.rowId === row.id && picked.index === c;
                  const bucket = buckets[c];
                  return (
                    <td key={c} className="border-b border-border/40 p-0.5">
                      <button
                        type="button"
                        data-cell={`${r}:${c}`}
                        aria-pressed={isPicked}
                        aria-label={`${row.name}, ${bucket ? bucketTitle(period, bucket) : ''}: ${value === null ? 'nothing due' : formatPct(value)}`}
                        onClick={() => setPicked(isPicked ? null : { rowId: row.id, index: c })}
                        style={value === null ? undefined : { background: heatBackground(value) }}
                        className={cn(
                          'flex size-9 items-center justify-center rounded-md t-meta font-display font-bold tabular-nums outline-none transition-shadow duration-150 cursor-pointer sm:size-10 pointer-coarse:size-11',
                          'focus-visible:ring-2 focus-visible:ring-primary-500/60',
                          value === null ? 'bg-surface-hover/50 text-text-muted' : 'text-text',
                          isPicked && 'ring-2 ring-text',
                        )}
                      >
                        {value === null ? '-' : Math.round(value)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 t-meta font-medium text-text-muted" aria-label="Colour key">
        {([['Low', 20], ['Fair', 65], ['Good', 95]] as const).map(([label, sample]) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span className="size-3.5 rounded" style={{ background: heatBackground(sample) }} aria-hidden="true" />
            {label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3.5 rounded bg-surface-hover" aria-hidden="true" />
          Nothing due
        </span>
        {matrix.truncated && <span>Showing the 30 busiest rows.</span>}
      </div>

      {selectedRow && selectedBucket && (
        <div role="status" className="flex flex-col gap-2 rounded-xl border border-primary-500/40 bg-surface-hover/40 p-3 sm:p-4">
          <p className="t-card font-display font-bold text-text">{selectedRow.name} · {bucketTitle(period, selectedBucket)}</p>
          {selectedCell ? (
            <ul className="flex flex-col gap-1 t-meta text-text-secondary">
              {modules.map((m) => {
                const b = selectedCell[m];
                return (
                  <li key={m} className="flex flex-wrap items-baseline gap-x-3">
                    <span className="min-w-24 font-display font-semibold text-text">{MODULE_LABEL[m]}</span>
                    <span className="tabular-nums">{b.due === 0 ? 'Nothing due' : `${formatPct(b.score)} score · ${b.due} due · ${b.done} done · ${b.late} late`}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="t-meta text-text-muted">Nothing was due in this {noun}.</p>
          )}
          {buckets.length > 1 && (
            <Button type="button" size="sm" variant="outline" className="self-start pointer-coarse:min-h-11" onClick={() => onZoom(selectedBucket)}>
              <ZoomIn size={14} aria-hidden="true" />
              Zoom to this {noun}
            </Button>
          )}
        </div>
      )}

      <p className="t-meta font-medium text-text-muted">Each box is one {noun}. Pick a box for the numbers.</p>
    </div>
  );
};
