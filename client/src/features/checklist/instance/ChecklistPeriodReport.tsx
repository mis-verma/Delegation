import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight, SearchX } from 'lucide-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { DateRangePicker, EmptyState, ExportMenu, InlineError, PANEL_CLASS, Skeleton, type DateRangeValue } from '../../../components';
import { TABLE_FRAME_CLASS, TH_CLASS, TH_CORNER_CLASS, TD_CLASS, TD_STICKY_CLASS, FIRST_COL_WIDTH_CLASS } from '../../../components/dataTable';
import { checklistReportApi, type PeriodBucketKind, type PeriodCell, type PeriodRowKind } from '../../../api/checklistReports';
import { useAuth } from '../../../context/AuthContext';
import { handleQueryRetry } from '../../../lib/queryHelpers';
import { exportPct, exportTitle, type TableRows } from '../../../lib/exportTable';
import { formatPct } from '../../../lib/percent';
import { rateToneClass } from '../checklistDisplay';
import { PeriodTabControl } from '../../dashboard/PeriodTabControl';
import { scoresHref } from '../../admin/directory/orgScoreData';
import { FIELD_LABEL_CLASS } from '../../scores/controlStyles';

const ROW_KINDS: readonly PeriodRowKind[] = ['person', 'checklist'];
const ROW_LABELS: Record<PeriodRowKind, string> = { person: 'By person', checklist: 'By checklist' };
const BUCKETS: readonly PeriodBucketKind[] = ['week', 'month'];
const BUCKET_LABELS: Record<PeriodBucketKind, string> = { week: 'Week', month: 'Month' };
const RECURRENCE_WORD: Record<string, string> = { DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', YEARLY: 'Yearly', ONE_TIME: 'One time' };

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const keyToDate = (key: string) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));

const formatCount = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const toneOf = (pct: number | null) => (pct === null ? 'text-text-muted' : rateToneClass(pct));

const CellFigures = ({ cell, compact = false }: { cell: PeriodCell | undefined; compact?: boolean }) => {
  if (!cell || cell.itemsDue === 0) return <span className="t-meta text-text-light">-</span>;
  return (
    <span className={cn('flex flex-col tabular-nums', compact ? 'items-start' : 'items-end')}>
      <span className="t-card font-display font-bold text-text">
        {formatCount(cell.itemsDone)} / {formatCount(cell.itemsDue)}
      </span>
      <span className={cn('t-meta font-display font-semibold', toneOf(cell.completionPct))}>{formatPct(cell.completionPct)} done</span>
      <span className={cn('t-meta font-display', cell.compliancePct === null ? 'text-text-light' : toneOf(cell.compliancePct))}>
        {cell.compliancePct === null ? 'No checked answers' : `Compliance ${formatPct(cell.compliancePct)}`}
      </span>
    </span>
  );
};

const TableSkeletonRows = () => (
  <div role="status" aria-label="Loading the report" className={cn(PANEL_CLASS, 'flex flex-col overflow-hidden')}>
    <div className="h-10 bg-primary-800" aria-hidden="true" />
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="flex items-center gap-4 border-t border-border/40 px-3 py-3" aria-hidden="true">
        <Skeleton className="h-4 w-40" />
        {Array.from({ length: 5 }).map((__, j) => <Skeleton key={j} className="hidden h-8 flex-1 sm:block" />)}
      </div>
    ))}
  </div>
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

  const changeRange = (next: DateRangeValue) => {
    if (next.from && next.to) setRange({ from: dayKey(next.from), to: dayKey(next.to) });
    else if (!next.from && !next.to) setRange(null);
  };

  const rowNoun = by === 'person' ? 'Person' : 'Checklist';
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

  return (
    <section className="flex flex-col gap-4" aria-labelledby="period-report-heading">
      <h2 id="period-report-heading" className="sr-only">Questions done by week or month</h2>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-full flex-col gap-1.5 sm:w-auto">
          <span className={FIELD_LABEL_CLASS}>Show</span>
          <PeriodTabControl value={by} options={ROW_KINDS} labels={ROW_LABELS} onChange={setBy} fill />
        </div>
        <div className="flex w-full flex-col gap-1.5 sm:w-auto">
          <span className={FIELD_LABEL_CLASS}>Group by</span>
          <PeriodTabControl value={bucket} options={BUCKETS} labels={BUCKET_LABELS} onChange={(next) => { setBucket(next); setRange(null); }} fill />
        </div>
        <div className="flex w-full flex-col gap-1.5 sm:w-72">
          <span className={FIELD_LABEL_CLASS}>Dates</span>
          <DateRangePicker value={shownRange} onChange={changeRange} placeholder={bucket === 'week' ? 'Last 4 weeks and this week' : 'Last 3 months and this month'} placeholderIsValue />
        </div>
        <div className="sm:ml-auto">
          <ExportMenu
            disabled={!data?.rows.length}
            aria-label="Export questions done by week or month"
            filename={`checklist-${by}-${bucket}`}
            sheetName="Questions done"
            title={exportTitle({ what: `Checklists ${ROW_LABELS[by].toLowerCase()}, by ${bucket}`, from: data?.from, to: data?.to, filters: { Store: storeName, Department: departmentName } })}
            getRows={exportRows}
            className="h-11 rounded-lg sm:h-9"
          />
        </div>
      </div>

      <details className="group t-meta font-display text-text-muted">
        <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 font-semibold text-text-secondary select-none hover:text-text pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
          How these figures are counted
          <ChevronRight className="size-3.5 transition-transform duration-200 group-open:rotate-90" aria-hidden />
        </summary>
        <ul className="flex list-disc flex-col gap-1 pb-1 pl-5 leading-relaxed">
          {(data?.notes ?? []).map((n) => <li key={n}>{n}</li>)}
        </ul>
      </details>

      {query.isPending && <TableSkeletonRows />}
      {query.isError && !data && <InlineError message="We couldn't load these figures. Check your connection and try again." onRetry={() => void query.refetch()} />}
      {data && data.rows.length === 0 && (
        <EmptyState icon={SearchX} title="No checklists ran in these dates" description="Pick other dates, or clear the store or department filter." />
      )}

      {data && data.rows.length > 0 && (
        <div className="flex flex-col gap-3" aria-busy={query.isPlaceholderData}>
          <div className={cn(TABLE_FRAME_CLASS, 'hidden lg:block')}>
            <table className="w-full border-collapse" style={{ minWidth: `${16 + (data.buckets.length + 1) * 9}rem` }}>
              <caption className="sr-only">Questions done and compliance, {ROW_LABELS[by].toLowerCase()}, by {bucket}</caption>
              <thead>
                <tr>
                  <th scope="col" className={cn(TH_CLASS, TH_CORNER_CLASS)}>{rowNoun}</th>
                  {data.buckets.map((b) => <th key={b.key} scope="col" className={cn(TH_CLASS, 'text-right')}>{b.label}</th>)}
                  <th scope="col" className={cn(TH_CLASS, 'text-right')}>Total</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const href = rowHref(r.id, r.name);
                  return (
                    <tr key={r.id} className="group border-b border-border/40 last:border-b-0 transition-colors duration-200 ease-out hover:bg-surface-hover">
                      <th scope="row" className={cn(TD_CLASS, TD_STICKY_CLASS, FIRST_COL_WIDTH_CLASS, 'text-left font-normal')}>
                        {href ? (
                          <Link viewTransition to={href} className="t-card font-display font-semibold text-text line-clamp-2 leading-snug rounded-sm outline-none hover:text-primary-600 focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:hover:text-primary-400">
                            {rowLabel(r.name, r.left)}
                          </Link>
                        ) : (
                          <span className="t-card font-display font-semibold text-text line-clamp-2 leading-snug">{rowLabel(r.name, r.left)}</span>
                        )}
                        {r.detail && <span className="block t-meta text-text-muted line-clamp-1">{subLabel(r.detail)}</span>}
                      </th>
                      {data.buckets.map((b) => (
                        <td key={b.key} className={cn(TD_CLASS, 'text-right')}>
                          <CellFigures cell={r.cells[b.key]} />
                        </td>
                      ))}
                      <td className={cn(TD_CLASS, 'text-right bg-surface-hover/40')}>
                        <CellFigures cell={r.total} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border">
                  <th scope="row" className={cn(TD_CLASS, TD_STICKY_CLASS, 'text-left t-card font-display font-bold text-text')}>All</th>
                  {data.buckets.map((b) => (
                    <td key={b.key} className={cn(TD_CLASS, 'text-right')}>
                      <CellFigures cell={data.totals.cells[b.key]} />
                    </td>
                  ))}
                  <td className={cn(TD_CLASS, 'text-right bg-surface-hover/40')}>
                    <CellFigures cell={data.totals.total} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <ul className="flex flex-col gap-3 lg:hidden">
            {data.rows.map((r) => {
              const href = rowHref(r.id, r.name);
              return (
                <li key={r.id} className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-3')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      {href ? (
                        <Link viewTransition to={href} className="t-card font-display font-semibold text-text line-clamp-2 leading-snug rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40">
                          {rowLabel(r.name, r.left)}
                        </Link>
                      ) : (
                        <span className="t-card font-display font-semibold text-text line-clamp-2 leading-snug">{rowLabel(r.name, r.left)}</span>
                      )}
                      {r.detail && <span className="t-meta text-text-muted line-clamp-2">{subLabel(r.detail)}</span>}
                    </div>
                    <CellFigures cell={r.total} />
                  </div>
                  <ul className="flex flex-col divide-y divide-border/50 border-t border-border/50">
                    {data.buckets.map((b) => (
                      <li key={b.key} className="flex items-center justify-between gap-3 py-2">
                        <span className="t-meta font-display font-semibold text-text-secondary">{b.label}</span>
                        <CellFigures cell={r.cells[b.key]} />
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>

          {query.isPlaceholderData && (
            <p role="status" className="t-meta font-display font-semibold text-text-secondary">Updating. These figures are for your last choice until the new ones load.</p>
          )}
        </div>
      )}
    </section>
  );
};
