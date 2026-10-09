import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { CalendarRange, RefreshCw } from 'lucide-react';
import { Button, DateRangePicker, EmptyState, InlineError, PageHeader, Skeleton, ToggleChip, type DateRangeValue } from '../../../components';
import { useAuth } from '../../../context/AuthContext';
import { checklistInstanceApi, type ChecklistStoreDailyRow } from '../../../api/checklistInstances';
import { handleQueryRetry } from '../../../lib/queryHelpers';
import { parseDateParam, toDateParam, formatPercent } from '../analytics/analyticsDisplay';
import { NEEDS_ATTENTION_BELOW } from '../analytics/useOwnerRankings';
import { useSearchPatch } from '../analytics/useAnalyticsWindow';
import { cn } from '@/lib/utils';
import { DepartmentMonthlySection } from './DepartmentMonthlySection';
import { ScoreDetailDialog } from './ScoreDetailDialog';
import { addFigures, emptyFigures, rateOf, type ScoreDetail, type ScoreFigures } from './scoreFigures';

const GOOD_FROM = 80;
const toneOf = (rate: number | null) =>
  rate == null ? 'text-text-light' : rate >= GOOD_FROM ? 'text-success' : rate >= NEEDS_ATTENTION_BELOW ? 'text-warning' : 'text-danger';

const ratio = (done: number, total: number) => (total > 0 ? (done / total) * 100 : null);

const addDaysTo = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

// 'YYYY-MM-DD' for each day from..to, built from the parts so a device time zone never shifts a day.
const eachDay = (from: Date, to: Date) => {
  const days: string[] = [];
  for (let d = new Date(from); d.getTime() <= to.getTime() && days.length < 366; d = addDaysTo(d, 1)) days.push(toDateParam(d));
  return days;
};

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayHead = (day: string) => {
  const d = parseDateParam(day);
  return d ? { weekday: WEEKDAY[d.getDay()], date: d.getDate(), isSunday: d.getDay() === 0 } : { weekday: '', date: 0, isSunday: false };
};

const PRESETS = [
  { key: 'week', label: 'Last 7 days' },
  { key: 'month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
] as const;

const presetRange = (key: (typeof PRESETS)[number]['key'], today: Date): DateRangeValue => {
  if (key === 'week') return { from: addDaysTo(today, -6), to: today };
  if (key === 'month') return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today };
  return { from: new Date(today.getFullYear(), today.getMonth() - 1, 1), to: new Date(today.getFullYear(), today.getMonth(), 0) };
};

const CELL = 'p-0 text-center font-display tabular-nums text-sm whitespace-nowrap';
// The whole cell is the button, so the tap target is the full cell (at least 44px tall on touch).
const CELL_BUTTON = 'block w-full px-2 py-2.5 pointer-coarse:py-3.5 cursor-pointer outline-none transition-colors duration-150 hover:bg-primary-500/10 focus-visible:bg-primary-500/10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/50';

const figuresOf = (r: ChecklistStoreDailyRow): ScoreFigures => ({ done: r.doneItems, total: r.totalItems, good: r.weightedGood, scored: r.weightedScored, dueRuns: r.dueRuns });

const longDay = (day: string) => {
  const d = parseDateParam(day);
  return d ? d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }) : day;
};
const STICKY = 'sticky left-0 z-10 bg-surface';

/**
 * Store by day: one row per store, one column per day, each cell the share of that store's due
 * checklist items that were done that day. Same completion rule as every other checklist report.
 */
export const StoreDailyPage = () => {
  const { token } = useAuth();
  const [params] = useSearchParams();
  const patch = useSearchPatch();

  const fromParam = params.get('from');
  const toParam = params.get('to');
  // Defaults to this month so far.
  const range = useMemo<DateRangeValue>(() => {
    const from = parseDateParam(fromParam);
    const to = parseDateParam(toParam);
    if (from && to && from.getTime() <= to.getTime()) return { from, to };
    return presetRange('month', new Date());
  }, [fromParam, toParam]);
  const from = range.from ? toDateParam(range.from) : '';
  const to = range.to ? toDateParam(range.to) : '';

  const setRange = (next: DateRangeValue) => {
    // A range only counts once both ends are picked.
    if (next.from && next.to) patch({ from: toDateParam(next.from), to: toDateParam(next.to) });
  };
  const activePreset = PRESETS.find((p) => {
    const r = presetRange(p.key, new Date());
    return r.from && r.to && toDateParam(r.from) === from && toDateParam(r.to) === to;
  })?.key;

  const query = useQuery({
    queryKey: ['analytics', 'store-daily', from, to],
    queryFn: () => checklistInstanceApi.getStoreDaily(from, to).then((r) => r.data),
    enabled: !!token && !!from && !!to,
    retry: handleQueryRetry,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const days = useMemo(() => (range.from && range.to ? eachDay(range.from, range.to) : []), [range]);
  const [detail, setDetail] = useState<ScoreDetail | null>(null);

  const { storeRows, dayTotals, grandFigures, grand } = useMemo(() => {
    const byStore = new Map<string, { name: string; cells: Map<string, ChecklistStoreDailyRow> }>();
    const totals = new Map<string, ScoreFigures>();
    const grandFigures = emptyFigures();
    for (const r of query.data ?? []) {
      let entry = byStore.get(r.storeId);
      if (!entry) {
        entry = { name: r.storeName, cells: new Map() };
        byStore.set(r.storeId, entry);
      }
      entry.cells.set(r.day, r);
      const t = totals.get(r.day) ?? emptyFigures();
      addFigures(t, figuresOf(r));
      totals.set(r.day, t);
      addFigures(grandFigures, figuresOf(r));
    }
    const rows = [...byStore.entries()]
      .map(([id, e]) => {
        const figures = emptyFigures();
        e.cells.forEach((c) => addFigures(figures, figuresOf(c)));
        return { id, name: e.name, cells: e.cells, figures, overall: rateOf(figures.done, figures.total) };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return { storeRows: rows, dayTotals: totals, grandFigures, grand: rateOf(grandFigures.done, grandFigures.total) };
  }, [query.data]);

  return (
    <div className="flex flex-col gap-4 w-full">
      <PageHeader
        icon={CalendarRange}
        title="Store and department scores"
        subtitle="Checklist completion store by store and day by day, then department by department each month."
      />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-surface p-3">
        {PRESETS.map((p) => (
          <ToggleChip key={p.key} on={activePreset === p.key} onClick={() => setRange(presetRange(p.key, new Date()))}>
            {p.label}
          </ToggleChip>
        ))}
        <DateRangePicker
          value={range}
          onChange={setRange}
          placeholder="Custom"
          placeholderIsValue
          className="w-auto shrink-0"
          // Made to match the ToggleChips beside it: same height and type, a bare icon instead of a tile, and the
          // whole range written out (no cut-off) with room on the right for the clear button.
          triggerClassName={cn(
            'h-11 sm:h-8 w-auto gap-1.5 pl-2.5 pr-10 rounded-full text-xs font-display [&>span:first-child]:size-4 [&>span:first-child]:bg-transparent [&>span:last-child]:overflow-visible [&>span:last-child]:whitespace-nowrap',
            activePreset ? 'text-text-secondary hover:border-border-hover' : 'border-primary-500/50 bg-primary-500/10 text-primary-700 dark:text-primary-300',
          )}
        />
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => void query.refetch()} disabled={query.isFetching} aria-label="Refresh numbers">
          <RefreshCw size={14} aria-hidden="true" className={query.isFetching ? 'animate-spin motion-reduce:animate-none' : undefined} />
          Refresh
        </Button>
      </div>

      <p className="text-xs font-display text-text-muted px-1">
        Each cell is items done out of items due that day. Tap any score to see its completion and compliance. A dash means no checklist was due. Green is {GOOD_FROM}% or more, red is below {NEEDS_ATTENTION_BELOW}%.
      </p>

      {query.isError && !query.data ? (
        <InlineError message="Could not load the store figures." onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <div className="flex flex-col gap-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-lg" />)}</div>
      ) : storeRows.length === 0 ? (
        <EmptyState icon={CalendarRange} title="No checklist work in this period" description="Pick a different period to see store figures." />
      ) : (
        <div className={cn('overflow-x-auto rounded-2xl border border-border bg-surface', query.isFetching && 'opacity-70 transition-opacity')}>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className={cn(STICKY, 'px-4 py-3 text-left font-display font-semibold text-xs text-text-muted min-w-36')}>Store</th>
                <th scope="col" className="px-3 py-3 text-center font-display font-semibold text-xs text-text-muted whitespace-nowrap">Overall</th>
                {days.map((day) => {
                  const h = dayHead(day);
                  return (
                    <th key={day} scope="col" className={cn('px-2 py-2 text-center font-display font-semibold text-xs whitespace-nowrap min-w-12', h.isSunday ? 'text-danger/80' : 'text-text-muted')}>
                      <span className="block">{h.date}</span>
                      <span className="block font-medium opacity-70">{h.weekday}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {storeRows.map((row) => (
                <tr key={row.id} className="border-t border-border/60 hover:bg-surface-hover/50 transition-colors motion-reduce:transition-none">
                  <th scope="row" className={cn(STICKY, 'px-4 py-2.5 text-left font-display font-medium text-sm text-text whitespace-nowrap')}>{row.name}</th>
                  <td className={cn(CELL, 'font-bold', toneOf(row.overall))}>
                    <button
                      type="button"
                      className={CELL_BUTTON}
                      aria-label={`${row.name}, whole period: completion and compliance`}
                      onClick={() => setDetail({ title: row.name, subtitle: 'The whole period', figures: row.figures, scope: { from, to, storeId: row.id } })}
                    >
                      {formatPercent(row.overall)}
                    </button>
                  </td>
                  {days.map((day) => {
                    const cell = row.cells.get(day);
                    const rate = cell ? ratio(cell.doneItems, cell.totalItems) : null;
                    return (
                      <td key={day} className={cn(CELL, toneOf(rate))}>
                        {cell ? (
                          <button
                            type="button"
                            className={CELL_BUTTON}
                            title={`${cell.doneItems} of ${cell.totalItems} items done`}
                            aria-label={`${row.name}, ${longDay(day)}: completion and compliance`}
                            onClick={() => setDetail({ title: row.name, subtitle: longDay(day), figures: figuresOf(cell), scope: { from: day, to: day, storeId: row.id } })}
                          >
                            {formatPercent(rate)}
                          </button>
                        ) : (
                          <span className="block px-2 py-2.5 pointer-coarse:py-3.5" aria-label="Nothing due">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-surface-hover/40">
                <th scope="row" className={cn(STICKY, 'px-4 py-2.5 text-left font-display font-bold text-sm text-text bg-surface-hover')}>All stores</th>
                <td className={cn(CELL, 'font-bold', toneOf(grand))}>
                  <button
                    type="button"
                    className={CELL_BUTTON}
                    aria-label="All stores, whole period: completion and compliance"
                    onClick={() => setDetail({ title: 'All stores', subtitle: 'The whole period', figures: grandFigures, scope: { from, to } })}
                  >
                    {formatPercent(grand)}
                  </button>
                </td>
                {days.map((day) => {
                  const t = dayTotals.get(day);
                  const rate = t ? ratio(t.done, t.total) : null;
                  return (
                    <td key={day} className={cn(CELL, 'font-semibold', toneOf(rate))}>
                      {t ? (
                        <button
                          type="button"
                          className={CELL_BUTTON}
                          aria-label={`All stores, ${longDay(day)}: completion and compliance`}
                          onClick={() => setDetail({ title: 'All stores', subtitle: longDay(day), figures: t, scope: { from: day, to: day } })}
                        >
                          {formatPercent(rate)}
                        </button>
                      ) : (
                        <span className="block px-2 py-2.5 pointer-coarse:py-3.5" aria-label="Nothing due">-</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <DepartmentMonthlySection onOpenDetail={setDetail} />

      <ScoreDetailDialog detail={detail} onClose={() => setDetail(null)} />
    </div>
  );
};
