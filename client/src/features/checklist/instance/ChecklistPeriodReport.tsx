import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight, SearchX } from 'lucide-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { DateRangePicker, EmptyState, ExportMenu, InlineError, PANEL_CLASS, Skeleton, type DateRangeValue } from '../../../components';
import { RadialGauge } from '../../../components/radialGauge/RadialGauge';
import { TABLE_FRAME_CLASS, TH_CLASS, TH_CORNER_CLASS, TD_CLASS, TD_STICKY_CLASS, FIRST_COL_WIDTH_CLASS } from '../../../components/dataTable';
import { checklistReportApi, type PeriodBucket, type PeriodBucketKind, type PeriodCell, type PeriodRow, type PeriodRowKind } from '../../../api/checklistReports';
import { useAuth } from '../../../context/AuthContext';
import { handleQueryRetry } from '../../../lib/queryHelpers';
import { exportPct, exportTitle, type TableRows } from '../../../lib/exportTable';
import { formatPct } from '../../../lib/percent';
import { GOOD_FROM, FAIR_FROM } from '../../../lib/scoreBands';
import { rateToneClass } from '../checklistDisplay';
import { PeriodTabControl } from '../../dashboard/PeriodTabControl';
import { scoresHref } from '../../admin/directory/orgScoreData';

const ROW_KINDS: readonly PeriodRowKind[] = ['person', 'checklist'];
const ROW_LABELS: Record<PeriodRowKind, string> = { person: 'By person', checklist: 'By checklist' };
const BUCKETS: readonly PeriodBucketKind[] = ['week', 'month', 'quarter', 'year'];
const BUCKET_LABELS: Record<PeriodBucketKind, string> = { week: 'Week', month: 'Month', quarter: 'Quarter', year: 'Year' };
const DEFAULT_RANGE_TEXT: Record<PeriodBucketKind, string> = {
  week: 'Last 4 weeks and this week',
  month: 'Last 3 months and this month',
  quarter: 'Last 3 quarters and this one',
  year: 'Last 2 years and this year',
};
const RECURRENCE_WORD: Record<string, string> = { DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', YEARLY: 'Yearly', ONE_TIME: 'One time' };
const RING_LIMIT = 12;

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const keyToDate = (key: string) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));

const formatCount = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const toneOf = (pct: number | null) => (pct === null ? 'text-text-muted' : rateToneClass(pct));
const ringColor = (pct: number | null) =>
  pct === null ? 'var(--color-border-hover)' : pct >= GOOD_FROM ? 'var(--color-success)' : pct >= FAIR_FROM ? 'var(--color-warning)' : 'var(--color-danger)';

const rowDomId = (id: string) => `period-row-${id}`;

const CellFigures = ({ cell, align = 'end' }: { cell: PeriodCell | undefined; align?: 'start' | 'end' }) => {
  if (!cell || cell.itemsDue === 0) return <span className="t-meta text-text-light">-</span>;
  return (
    <span className={cn('flex flex-col tabular-nums leading-tight', align === 'start' ? 'items-start' : 'items-end')}>
      <span className="whitespace-nowrap t-meta font-display">
        <span className="font-bold text-text">{formatCount(cell.itemsDone)}/{formatCount(cell.itemsDue)}</span>
        <span className="text-text-light"> · </span>
        <span className={cn('font-semibold', toneOf(cell.completionPct))}>{formatPct(cell.completionPct)}</span>
      </span>
      <span className={cn('whitespace-nowrap t-meta font-display', cell.compliancePct === null ? 'text-text-light' : toneOf(cell.compliancePct))}>
        {cell.compliancePct === null ? 'Nothing checked' : `Compliance ${formatPct(cell.compliancePct)}`}
      </span>
    </span>
  );
};

const LoadingState = () => (
  <div role="status" aria-label="Loading the report" className="flex flex-col gap-3">
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[5.5rem] rounded-lg" />)}
    </div>
    <div className={cn(PANEL_CLASS, 'flex flex-col overflow-hidden')} aria-hidden="true">
      <div className="h-10 bg-primary-800" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-t border-border/40 px-3 py-2.5">
          <Skeleton className="h-4 w-40" />
          {Array.from({ length: 5 }).map((__, j) => <Skeleton key={j} className="hidden h-7 flex-1 sm:block" />)}
        </div>
      ))}
    </div>
  </div>
);

const periodCaption = (kind: PeriodBucketKind, bucket: PeriodBucket, isCurrent: boolean) => {
  const word = BUCKET_LABELS[kind].toLowerCase();
  return `${isCurrent ? `This ${word}` : `Latest ${word}`}, ${bucket.label}`;
};

interface RingCardProps {
  row: PeriodRow;
  cell: PeriodCell;
  showRuns: boolean;
  label: string;
  sub: string;
  onPick: () => void;
}

const RingCard = ({ row, cell, showRuns, label, sub, onPick }: RingCardProps) => (
  <li>
    <button
      type="button"
      onClick={onPick}
      aria-label={`${label}: ${formatPct(cell.completionPct)} of questions done. Show in the table`}
      className={cn(
        PANEL_CLASS,
        'flex w-full min-h-11 items-center gap-3 p-2.5 text-left outline-none transition-[border-color,transform] duration-150 ease-out hover:border-border-hover active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40',
      )}
    >
      <RadialGauge
        percent={cell.completionPct ?? 0}
        size={60}
        variant="circle"
        thickness={6}
        gradientFrom={ringColor(cell.completionPct)}
        gradientTo={ringColor(cell.completionPct)}
        ariaLabel={`${label} ${formatPct(cell.completionPct)}`}
        className="shrink-0"
      >
        <span className={cn('t-meta font-display font-bold tabular-nums', toneOf(cell.completionPct))}>{formatPct(cell.completionPct)}</span>
      </RadialGauge>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="t-card font-display font-semibold text-text line-clamp-2 leading-snug">{row.left ? `${label} (left)` : label}</span>
        {sub && <span className="t-meta text-text-muted line-clamp-1">{sub}</span>}
        <span className="t-meta font-display tabular-nums text-text-secondary">
          {formatCount(cell.itemsDone)} / {formatCount(cell.itemsDue)} questions
          {showRuns && cell.runsDue > 0 && <span className="text-text-muted"> · {cell.runsDone} of {cell.runsDue} runs</span>}
        </span>
        <span className={cn('t-meta font-display tabular-nums', cell.compliancePct === null ? 'text-text-light' : toneOf(cell.compliancePct))}>
          {cell.compliancePct === null ? 'Nothing checked yet' : `Compliance ${formatPct(cell.compliancePct)}`}
        </span>
      </span>
    </button>
  </li>
);

interface ChecklistPeriodReportProps {
  storeId?: string;
  departmentId?: string;
  storeName?: string;
  departmentName?: string;
}

export const ChecklistPeriodReport = ({ storeId, departmentId, storeName, departmentName }: ChecklistPeriodReportProps) => {
  const { token } = useAuth();
  const [by, setBy] = useState<PeriodRowKind>('person');
  const [bucket, setBucket] = useState<PeriodBucketKind>('week');
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [showAllRings, setShowAllRings] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
  }, []);

  const params = { by, bucket, from: range?.from, to: range?.to, storeId, departmentId };
  const query = useQuery({
    queryKey: ['checklist-reports', 'periods', by, bucket, range?.from ?? '', range?.to ?? '', storeId ?? '', departmentId ?? ''],
    queryFn: () => checklistReportApi.periods(params),
    enabled: !!token,
    retry: handleQueryRetry,
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const shownRange = useMemo<DateRangeValue>(
    () => (data ? { from: keyToDate(data.from), to: keyToDate(data.to) } : { from: null, to: null }),
    [data],
  );

  const latest = data?.buckets.at(-1);
  const rings = useMemo(() => {
    if (!data || !latest) return [];
    return data.rows
      .flatMap((row) => {
        const cell = row.cells[latest.key];
        return cell && cell.itemsDue > 0 ? [{ row, cell }] : [];
      })
      .sort((a, b) => (a.cell.completionPct ?? 101) - (b.cell.completionPct ?? 101) || a.row.name.localeCompare(b.row.name));
  }, [data, latest]);
  const visibleRings = showAllRings ? rings : rings.slice(0, RING_LIMIT);
  const latestIsCurrent = !!data && !!latest && latest.to === data.to && data.to >= dayKey(new Date());

  const changeRange = (next: DateRangeValue) => {
    if (next.from && next.to) setRange({ from: dayKey(next.from), to: dayKey(next.to) });
    else if (!next.from && !next.to) setRange(null);
  };

  const changeBucket = (next: PeriodBucketKind) => {
    setBucket(next);
    setRange(null);
    setShowAllRings(false);
  };

  const changeBy = (next: PeriodRowKind) => {
    setBy(next);
    setShowAllRings(false);
  };

  const showRow = (id: string) => {
    const desktop = window.matchMedia('(min-width: 1024px)').matches;
    const target = document.getElementById(`${rowDomId(id)}-${desktop ? 'table' : 'card'}`);
    target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    setHighlightId(id);
    if (highlightTimer.current !== null) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightId(null), 2400);
  };

  const rowNoun = by === 'person' ? 'Person' : 'Checklist';
  const bucketWord = BUCKET_LABELS[bucket].toLowerCase();
  const exportRows = (): TableRows => {
    if (!data) return [];
    const head: string[] = [rowNoun, by === 'person' ? 'Department, store' : 'Repeats'];
    for (const b of data.buckets) head.push(`${b.label} due`, `${b.label} done`, `${b.label} completion %`, `${b.label} compliance %`);
    head.push('Total due', 'Total done', 'Total completion %', 'Total compliance %');
    const line = (cells: Record<string, PeriodCell>, total: PeriodCell) => [
      ...data.buckets.flatMap((b) => {
        const c = cells[b.key];
        return c ? [c.itemsDue, c.itemsDone, exportPct(c.completionPct), exportPct(c.compliancePct)] : [0, 0, null, null];
      }),
      total.itemsDue, total.itemsDone, exportPct(total.completionPct), exportPct(total.compliancePct),
    ];
    return [
      head,
      ...data.rows.map((r) => [r.left ? `${r.name} (left)` : r.name, by === 'person' ? r.detail : RECURRENCE_WORD[r.detail] ?? r.detail, ...line(r.cells, r.total)]),
      ['All', '', ...line(data.totals.cells, data.totals.total)],
    ];
  };

  const rowHref = (id: string, name: string) => (data && by === 'person' ? scoresHref('person', id, name, data.from, data.to) : null);
  const rowLabel = (name: string, left: boolean) => (left ? `${name} (left)` : name);
  const subLabel = (detail: string) => (by === 'person' ? detail : RECURRENCE_WORD[detail] ?? detail);

  const nameCell = (r: PeriodRow) => {
    const href = rowHref(r.id, r.name);
    return href ? (
      <Link viewTransition to={href} className="t-card font-display font-semibold text-text line-clamp-2 leading-snug rounded-sm outline-none hover:text-primary-600 focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:hover:text-primary-400">
        {rowLabel(r.name, r.left)}
      </Link>
    ) : (
      <span className="t-card font-display font-semibold text-text line-clamp-2 leading-snug">{rowLabel(r.name, r.left)}</span>
    );
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="period-report-heading">
      <h2 id="period-report-heading" className="sr-only">Questions done by {bucketWord}</h2>

      <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <PeriodTabControl value={by} options={ROW_KINDS} labels={ROW_LABELS} onChange={changeBy} fill className="sm:w-auto" />
        <PeriodTabControl value={bucket} options={BUCKETS} labels={BUCKET_LABELS} onChange={changeBucket} columns className="sm:w-80" />
        <div className="flex items-center gap-2 sm:ml-auto">
          <DateRangePicker
            value={shownRange}
            onChange={changeRange}
            placeholder={DEFAULT_RANGE_TEXT[bucket]}
            placeholderIsValue
            className="min-w-0 flex-1 sm:w-64 sm:flex-none"
            triggerClassName="min-h-11 sm:min-h-9 sm:h-9 py-0"
          />
          <ExportMenu
            disabled={!data?.rows.length}
            aria-label={`Export questions done by ${bucketWord}`}
            filename={`checklist-${by}-${bucket}`}
            sheetName="Questions done"
            title={exportTitle({ what: `Checklists ${ROW_LABELS[by].toLowerCase()}, by ${bucketWord}`, from: data?.from, to: data?.to, filters: { Store: storeName, Department: departmentName } })}
            getRows={exportRows}
            className="h-11 shrink-0 rounded-lg sm:h-9"
          />
        </div>
      </div>

      {query.isPending && <LoadingState />}
      {query.isError && !data && <InlineError message="We couldn't load these figures. Check your connection and try again." onRetry={() => void query.refetch()} />}
      {data && data.rows.length === 0 && (
        <EmptyState icon={SearchX} title="No checklists ran in these dates" description="Pick other dates, or clear the store or department filter." />
      )}

      {data && data.rows.length > 0 && (
        <div className="flex flex-col gap-3" aria-busy={query.isPlaceholderData}>
          {latest && (
            <section className="flex flex-col gap-2" aria-labelledby="period-rings-heading">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <h3 id="period-rings-heading" className="t-card font-display font-bold text-text">
                  {periodCaption(bucket, latest, latestIsCurrent)}
                </h3>
                <span className="t-meta font-display text-text-muted tabular-nums">
                  {rings.length ? `${rings.length} ${by === 'person' ? (rings.length === 1 ? 'person' : 'people') : rings.length === 1 ? 'checklist' : 'checklists'}, lowest first` : `Nothing due this ${bucketWord}`}
                </span>
              </div>
              {rings.length > 0 && (
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {visibleRings.map(({ row, cell }) => (
                    <RingCard
                      key={row.id}
                      row={row}
                      cell={cell}
                      showRuns={by === 'checklist'}
                      label={row.name}
                      sub={row.detail ? subLabel(row.detail) : ''}
                      onPick={() => showRow(row.id)}
                    />
                  ))}
                </ul>
              )}
              {rings.length > RING_LIMIT && (
                <button
                  type="button"
                  onClick={() => setShowAllRings((v) => !v)}
                  aria-expanded={showAllRings}
                  className="self-start inline-flex min-h-9 items-center gap-1 rounded-lg px-2 t-meta font-display font-semibold text-primary-700 outline-none transition-colors duration-150 ease-out hover:bg-primary-500/10 focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:min-h-11 dark:text-primary-300"
                >
                  {showAllRings ? 'Show fewer' : `Show all ${rings.length}`}
                </button>
              )}
            </section>
          )}

          <div className={cn(TABLE_FRAME_CLASS, 'hidden lg:block')}>
            <table className="w-full border-collapse" style={{ minWidth: `${14 + (data.buckets.length + 1) * 7.5}rem` }}>
              <caption className="sr-only">Questions done and compliance, {ROW_LABELS[by].toLowerCase()}, by {bucketWord}</caption>
              <thead>
                <tr>
                  <th scope="col" className={cn(TH_CLASS, TH_CORNER_CLASS, 'py-2.5')}>{rowNoun}</th>
                  {data.buckets.map((b) => <th key={b.key} scope="col" className={cn(TH_CLASS, 'py-2.5 text-right')}>{b.label}</th>)}
                  <th scope="col" className={cn(TH_CLASS, 'py-2.5 text-right')}>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr
                    key={r.id}
                    id={`${rowDomId(r.id)}-table`}
                    className={cn(
                      'group scroll-mt-24 border-b border-border/40 last:border-b-0 transition-colors duration-200 ease-out hover:bg-surface-hover',
                      highlightId === r.id && 'bg-primary-500/10',
                    )}
                  >
                    <th scope="row" className={cn(TD_CLASS, TD_STICKY_CLASS, FIRST_COL_WIDTH_CLASS, 'py-2 text-left font-normal', highlightId === r.id && 'bg-[color-mix(in_oklab,var(--color-primary-500)_10%,var(--color-surface))]')}>
                      {nameCell(r)}
                      {r.detail && <span className="block t-meta text-text-muted line-clamp-1">{subLabel(r.detail)}</span>}
                    </th>
                    {data.buckets.map((b) => (
                      <td key={b.key} className={cn(TD_CLASS, 'py-2 text-right')}>
                        <CellFigures cell={r.cells[b.key]} />
                      </td>
                    ))}
                    <td className={cn(TD_CLASS, 'py-2 text-right bg-surface-hover/40')}>
                      <CellFigures cell={r.total} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border">
                  <th scope="row" className={cn(TD_CLASS, TD_STICKY_CLASS, 'py-2 text-left t-card font-display font-bold text-text')}>All</th>
                  {data.buckets.map((b) => (
                    <td key={b.key} className={cn(TD_CLASS, 'py-2 text-right')}>
                      <CellFigures cell={data.totals.cells[b.key]} />
                    </td>
                  ))}
                  <td className={cn(TD_CLASS, 'py-2 text-right bg-surface-hover/40')}>
                    <CellFigures cell={data.totals.total} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <ul className="flex flex-col gap-2 lg:hidden">
            {data.rows.map((r) => (
              <li
                key={r.id}
                id={`${rowDomId(r.id)}-card`}
                className={cn(PANEL_CLASS, 'flex scroll-mt-24 flex-col gap-2 p-3 transition-colors duration-200 ease-out', highlightId === r.id && 'border-primary-400 bg-primary-500/5')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    {nameCell(r)}
                    {r.detail && <span className="t-meta text-text-muted line-clamp-2">{subLabel(r.detail)}</span>}
                  </div>
                  <CellFigures cell={r.total} />
                </div>
                <ul className="flex flex-col divide-y divide-border/50 border-t border-border/50">
                  {data.buckets.map((b) => (
                    <li key={b.key} className="flex items-center justify-between gap-3 py-1.5">
                      <span className="t-meta font-display font-semibold text-text-secondary">{b.label}</span>
                      <CellFigures cell={r.cells[b.key]} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>

          {query.isPlaceholderData && (
            <p role="status" className="t-meta font-display font-semibold text-text-secondary">Updating. These figures are for your last choice until the new ones load.</p>
          )}
        </div>
      )}

      <details className="group t-meta font-display text-text-muted">
        <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 font-semibold text-text-secondary select-none hover:text-text pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
          How these figures are counted
          <ChevronRight className="size-3.5 transition-transform duration-200 group-open:rotate-90" aria-hidden />
        </summary>
        <ul className="flex list-disc flex-col gap-1 pb-1 pl-5 leading-relaxed">
          {(data?.notes ?? []).map((n) => <li key={n}>{n}</li>)}
        </ul>
      </details>
    </section>
  );
};
