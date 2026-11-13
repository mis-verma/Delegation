import { memo, useCallback, useLayoutEffect, useMemo, useRef, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';
import type { MatrixBucket, MatrixCell, MatrixPeriod, MatrixResponse } from '../../../../api/scores';
import { HEAT_KEY, heatExact, heatFill, heatLook, heatWhole } from '../../../../lib/heatScale';
import { MODULE_LABEL } from '../../../../lib/scoreLabels';
import { useOrgToday } from '../../../checklist/useOrgToday';
import { bucketShortLabel, bucketTitle, PERIOD_NOUN } from './biTimeUtils';
import { BI_MODULES, cellDue, cellValue, measureLabel, moduleTitle, type BiMeasure, type BiModule, type DetailRow } from './biMetrics';
import { HeatTooltip, type HeatTipContent, type HeatTipLine, type HeatTooltipHandle } from './HeatTooltip';

interface HeatRow extends DetailRow {
  cells: (MatrixCell | null)[];
  left?: boolean;
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

const WHOLE = 'whole';
const WEEKDAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ARROWS = new Set(['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']);

const weekdayIndex = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();

const whenText = (period: MatrixPeriod, bucket: MatrixBucket | undefined): string => {
  if (!bucket) return 'Whole period';
  return period === 'day' ? `${WEEKDAY_LONG[weekdayIndex(bucket.from)] ?? ''}, ${bucketTitle(period, bucket)}` : bucketTitle(period, bucket);
};

const linesFor = (cell: MatrixCell | null, module: BiModule): HeatTipLine[] => {
  if (!cell) return [];
  const describe = (done: number, due: number, late: number) => `${done} of ${due} done${late > 0 ? `, ${late} late` : ''}`;
  if (module === 'all') {
    return BI_MODULES.filter((m) => cell[m].due > 0).map((m) => ({ label: MODULE_LABEL[m], value: describe(cell[m].done, cell[m].due, cell[m].late) }));
  }
  const block = cell[module];
  return block.due > 0 ? [{ label: MODULE_LABEL[module], value: describe(block.done, block.due, block.late) }] : [];
};

interface RowViewProps {
  row: HeatRow;
  r: number;
  module: BiModule;
  measure: BiMeasure;
  period: MatrixPeriod;
  buckets: MatrixBucket[];
  todayIndex: number;
}

const HeatRowView = memo(function HeatRowView({ row, r, module, measure, period, buckets, todayIndex }: RowViewProps) {
  const isTotal = row.id === 'total';
  const overall = cellValue(row.whole, module, measure);
  const rule = isTotal ? 'border-b-2 border-b-border/70' : 'border-b border-b-border/30';
  return (
    <tr className={cn('group/row', isTotal && 'bg-surface-hover/40')}>
      <th scope="row" className={cn('sticky left-0 z-10 w-36 min-w-32 px-1 py-0.5 text-left sm:w-52 sm:min-w-44', rule, isTotal ? 'bg-surface-hover' : 'bg-surface')}>
        <button
          type="button"
          data-r={r}
          data-c={WHOLE}
          aria-haspopup="dialog"
          aria-label={`${row.name}: open the details`}
          className="flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left outline-none transition-colors duration-150 group-hover/row:bg-primary-500/[0.06] hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary-500/50 pointer-coarse:min-h-11"
        >
          <span className={cn('line-clamp-2 min-w-0 flex-1 t-meta font-display leading-snug text-text', isTotal ? 'font-extrabold' : 'font-semibold')}>{row.name}</span>
          {row.left && <span className="shrink-0 rounded-full bg-surface-hover px-1.5 t-meta font-medium text-text-muted">Left</span>}
        </button>
      </th>
      {row.cells.map((cell, c) => {
        const value = cellValue(cell, module, measure);
        return (
          <td key={c} className={cn('p-1', rule, c === todayIndex && 'bg-primary-500/[0.04]')}>
            <button
              type="button"
              data-r={r}
              data-c={c}
              aria-haspopup="dialog"
              aria-label={`${row.name}, ${whenText(period, buckets[c])}: ${value === null ? 'nothing due' : heatExact(value)}. Open the details.`}
              style={value === null ? undefined : heatLook(value)}
              className={cn(
                'flex h-9 w-full min-w-8 cursor-pointer items-center justify-center rounded-md t-meta font-display font-semibold tabular-nums outline-none sm:h-10 pointer-coarse:h-11 pointer-coarse:min-w-10',
                'transition-[box-shadow,transform] duration-150 ease-out hover:ring-2 hover:ring-primary-500/55 hover:ring-offset-1 hover:ring-offset-surface active:scale-[0.94]',
                'focus-visible:ring-2 focus-visible:ring-primary-500/70 focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
                value === null && 'bg-surface-hover/40 text-text-light',
              )}
            >
              {value === null ? <span className="size-1 rounded-full bg-current" aria-hidden="true" /> : heatWhole(value)}
            </button>
          </td>
        );
      })}
      <td className={cn('border-l border-l-border/40 px-2 py-1', rule)}>
        <button
          type="button"
          data-r={r}
          data-c={WHOLE}
          aria-haspopup="dialog"
          aria-label={`${row.name}, whole period: ${overall === null ? 'nothing due' : heatExact(overall)}. Open the details.`}
          style={overall === null ? undefined : heatLook(overall)}
          className={cn(
            'flex h-9 w-full min-w-12 cursor-pointer items-center justify-center rounded-full px-2 t-meta font-display font-bold tabular-nums outline-none transition-[box-shadow] duration-150 sm:h-10',
            'hover:ring-2 hover:ring-primary-500/55 hover:ring-offset-1 hover:ring-offset-surface focus-visible:ring-2 focus-visible:ring-primary-500/70',
            overall === null && 'text-text-light',
          )}
        >
          {overall === null ? '-' : `${heatWhole(overall)}%`}
        </button>
      </td>
    </tr>
  );
});

export const HeatGrid = ({ matrix, module, measure, lowestFirst, totalLabel, maxRows, showTotal = true, onOpen }: HeatGridProps) => {
  const { period, buckets } = matrix;
  const today = useOrgToday();
  const tipRef = useRef<HeatTooltipHandle>(null);
  const headRefs = useRef<(HTMLTableCellElement | null)[]>([]);
  const activeCol = useRef<number | null>(null);

  const rows = useMemo<HeatRow[]>(() => {
    const sorted: HeatRow[] = [...matrix.rows].sort((a, b) => {
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

  const todayIndex = useMemo(() => buckets.findIndex((b) => today >= b.from && today <= b.to), [buckets, today]);
  const measureText = measureLabel(measure, module);
  const noun = PERIOD_NOUN[period];

  const latest = useRef({ rows, module, measure, period, buckets, measureText, onOpen });
  useLayoutEffect(() => {
    latest.current = { rows, module, measure, period, buckets, measureText, onOpen };
  });

  const target = (el: EventTarget | null) => (el instanceof Element ? el.closest<HTMLElement>('[data-r]') : null);
  const position = (el: HTMLElement) => {
    const r = Number(el.dataset.r);
    const c = el.dataset.c === WHOLE ? null : Number(el.dataset.c);
    return { r, c };
  };

  const highlightColumn = useCallback((c: number | null) => {
    if (activeCol.current === c) return;
    if (activeCol.current !== null) headRefs.current[activeCol.current]?.removeAttribute('data-active');
    if (c !== null) headRefs.current[c]?.setAttribute('data-active', 'true');
    activeCol.current = c;
  }, []);

  const showTip = useCallback((el: HTMLElement) => {
    const { r, c } = position(el);
    const { rows: list, module: mod, measure: meas, period: per, buckets: bks, measureText: label } = latest.current;
    const row = list[r];
    if (!row) return;
    const cell = c === null ? row.whole : row.cells[c] ?? null;
    const content: HeatTipContent = {
      title: row.name,
      subtitle: whenText(per, c === null ? undefined : bks[c]),
      value: cellValue(cell, mod, meas),
      measure: label,
      lines: linesFor(cell, mod),
    };
    highlightColumn(c);
    tipRef.current?.show(el, content);
  }, [highlightColumn]);

  const hideTip = useCallback(() => {
    highlightColumn(null);
    tipRef.current?.hide();
  }, [highlightColumn]);

  const onPointerOver = (e: PointerEvent<HTMLTableElement>) => {
    if (e.pointerType === 'touch') return;
    const el = target(e.target);
    if (el) showTip(el);
    else hideTip();
  };

  const onFocus = (e: FocusEvent<HTMLTableElement>) => {
    const el = target(e.target);
    if (el?.matches(':focus-visible')) showTip(el);
  };

  const onBlur = (e: FocusEvent<HTMLTableElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hideTip();
  };

  const onClick = (e: MouseEvent<HTMLTableElement>) => {
    const el = target(e.target);
    if (!el) return;
    const { r, c } = position(el);
    const row = latest.current.rows[r];
    if (!row) return;
    hideTip();
    latest.current.onOpen(row, c);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    if (e.key === 'Escape') {
      hideTip();
      return;
    }
    const el = target(e.target);
    if (!el || !ARROWS.has(e.key)) return;
    const { r, c } = position(el);
    const col = c === null ? (el.closest('th') ? -1 : buckets.length) : c;
    const nr = r + (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0);
    const nc = col + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0);
    const key = nc < 0 ? `th` : nc >= buckets.length ? 'last' : String(nc);
    const next = e.currentTarget.querySelector<HTMLElement>(
      key === 'th' ? `th [data-r="${nr}"]` : key === 'last' ? `td:last-child [data-r="${nr}"]` : `[data-r="${nr}"][data-c="${nc}"]`,
    );
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto overscroll-x-contain rounded-2xl ring-1 ring-inset ring-border/50">
        <table
          onClick={onClick}
          onPointerOver={onPointerOver}
          onPointerLeave={hideTip}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          className="w-full border-separate border-spacing-0"
        >
          <caption className="sr-only">{moduleTitle(module)} {measureText.toLowerCase()} by {noun}, one row per name. Pick a name or a box to open its details. Use the arrow keys to move between boxes.</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 w-36 min-w-32 border-b border-border/40 bg-surface px-3 py-2 text-left t-meta font-display font-semibold text-text-muted sm:w-52 sm:min-w-44">Name</th>
              {buckets.map((b, i) => {
                const isToday = i === todayIndex;
                return (
                  <th
                    key={b.from}
                    ref={(el) => { headRefs.current[i] = el; }}
                    scope="col"
                    title={bucketTitle(period, b)}
                    className={cn(
                      'border-b border-border/40 px-0.5 py-2 text-center transition-colors duration-100 data-[active=true]:bg-primary-500/[0.08]',
                      isToday && 'bg-primary-500/[0.04]',
                    )}
                  >
                    <span className="flex flex-col items-center gap-0.5 leading-none">
                      {period === 'day' && (
                        <span className={cn('t-meta font-display font-medium', isToday ? 'text-primary-700 dark:text-primary-300' : 'text-text-light')}>
                          {WEEKDAY_SHORT[weekdayIndex(b.from)] ?? ''}
                        </span>
                      )}
                      <span className={cn('t-meta font-display font-semibold tabular-nums', isToday ? 'text-primary-700 dark:text-primary-300' : 'text-text-secondary')}>
                        {bucketShortLabel(period, b)}
                      </span>
                      {isToday && (
                        <>
                          <span className="size-1 rounded-full bg-primary-600" aria-hidden="true" />
                          <span className="sr-only">Today</span>
                        </>
                      )}
                    </span>
                  </th>
                );
              })}
              <th scope="col" className="border-b border-l border-border/40 px-2 py-2 text-center t-meta font-display font-semibold text-text-secondary">Overall</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <HeatRowView key={row.id} row={row} r={r} module={module} measure={measure} period={period} buckets={buckets} todayIndex={todayIndex} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 t-meta font-medium text-text-muted" aria-label="Colour key">
        <span className="font-display font-semibold text-text-secondary">{measureText}</span>
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
        <span className="basis-full">
          Each box is one {noun}, shown as a whole number.
          <span className="pointer-coarse:hidden"> Hover it for the exact figure, click it for details.</span>
          <span className="pointer-fine:hidden"> Tap it for details.</span>
        </span>
      </div>

      <HeatTooltip ref={tipRef} />
    </div>
  );
};
