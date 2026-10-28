import { useMemo, useState } from 'react';
import { Check, ChartNoAxesColumn } from 'lucide-react';
import { Button, EmptyState, InlineError, Skeleton, useConfirm, ExportMenu, ENTITY_CARD_CLASS } from '../../components';
import { PeriodTabControl } from '../dashboard/PeriodTabControl';
import { exportTitle } from '../../lib/exportTable';
import type { CategoryTatRow, TatSummary, TatWindowDays } from '../../api/categories';
import { useCategoryTatQuery, useUpdateCategoryMutation } from './hook';
import { SLA_BAR, SLA_TEXT, TAT_EXPORT_HEADER, formatMinutes, formatTatHours, slaTone, tatExportRow } from './tatFormat';

const WINDOW_OPTIONS = ['30', '90', '180', '365', '0'] as const;
type WindowKey = (typeof WINDOW_OPTIONS)[number];

const WINDOW_LABELS: Record<WindowKey, string> = { '30': '30 days', '90': '90 days', '180': '6 months', '365': '1 year', '0': 'All time' };

const TILE_CLASS = 'flex flex-col gap-1 rounded-2xl border border-border/60 bg-surface p-3 sm:p-4';

interface MetricProps {
  label: string;
  summary?: TatSummary;
  avgOnly?: number | null;
}

const Metric = ({ label, summary, avgOnly }: MetricProps) => (
  <div className="flex min-w-0 flex-col gap-0.5">
    <span className="t-meta font-display font-medium text-text-muted">{label}</span>
    <span className="t-card font-display font-bold tabular-nums text-text">{formatMinutes(summary ? summary.median : (avgOnly ?? null))}</span>
    <span className="t-meta tabular-nums text-text-muted">{summary ? `Slowest 1 in 10: ${formatMinutes(summary.p90)}` : 'Average'}</span>
  </div>
);

interface TatRowCardProps {
  row: CategoryTatRow;
  applying: boolean;
  onApply: (row: CategoryTatRow) => void;
}

const TatRowCard = ({ row, applying, onApply }: TatRowCardProps) => {
  const tone = slaTone(row.slaMetPct);
  const suggested = row.suggestedTatHours;
  const differs = suggested !== null && suggested !== row.configuredTatHours;

  return (
    <article className={`${ENTITY_CARD_CLASS} justify-start gap-3`}>
      <header className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="line-clamp-2 break-words t-card font-display font-bold leading-snug text-text" title={row.name}>{row.name}</h3>
          <p className="truncate t-meta font-display text-text-muted">{row.departmentName ?? 'No department'}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span className={`t-stat font-display font-bold tabular-nums ${SLA_TEXT[tone]}`}>{row.slaMetPct === null ? '–' : `${row.slaMetPct}%`}</span>
          <span className="t-meta text-text-muted">on time</span>
        </div>
      </header>

      <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover" role="img" aria-label={row.slaMetPct === null ? 'No on-time data yet' : `${row.slaMetPct} percent finished on time`}>
        <div className={`h-full rounded-full transition-all duration-300 ease-out ${SLA_BAR[tone]}`} style={{ width: `${row.slaMetPct ?? 0}%` }} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="First reply" summary={row.response} />
        <Metric label="Finished" summary={row.completion} />
        <Metric label="Closed" summary={row.closure} />
        <Metric label="On hold" avgOnly={row.onHoldAvg} />
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border/50 pt-3">
        <p className="t-meta tabular-nums text-text-muted">
          {row.total} {row.total === 1 ? 'ticket' : 'tickets'}, {row.closed} closed, {row.rejected} declined, {row.open} open
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="t-meta font-display font-semibold text-text-secondary">
            {row.categoryId === null ? 'No due time' : `Due in ${formatTatHours(row.configuredTatHours)}`}
          </span>
          {row.categoryId !== null && differs && (
            <Button variant="outline" size="sm" className="min-h-9 pointer-coarse:min-h-11 font-display font-semibold" isLoading={applying} onClick={() => onApply(row)}>
              Set to {formatTatHours(suggested)}
            </Button>
          )}
          {row.categoryId !== null && suggested !== null && !differs && (
            <span className="inline-flex items-center gap-1 t-meta font-display font-semibold text-vivid-green-text">
              <Check className="size-3.5" aria-hidden />
              Fits the data
            </span>
          )}
        </div>
      </footer>
    </article>
  );
};

const PanelSkeleton = () => (
  <div className="flex flex-col gap-3" aria-hidden>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
    </div>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}
    </div>
  </div>
);

export const CategoryTatPanel = () => {
  const confirm = useConfirm();
  const [windowKey, setWindowKey] = useState<WindowKey>('90');
  const days = Number(windowKey) as TatWindowDays;
  const { data, isPending, isError, refetch } = useCategoryTatQuery(days);
  const updateMut = useUpdateCategoryMutation();

  const rows = data?.rows ?? [];
  const total = data?.total;

  const exportRows = useMemo(() => {
    if (!data) return [];
    return [TAT_EXPORT_HEADER, ...data.rows.map(tatExportRow), tatExportRow(data.total)];
  }, [data]);

  const apply = async (row: CategoryTatRow) => {
    if (row.categoryId === null || row.suggestedTatHours === null) return;
    const ok = await confirm({
      title: `Set ${row.name} to ${formatTatHours(row.suggestedTatHours)}?`,
      description: 'New tickets in this category get this due time. Tickets already filed keep theirs.',
      confirmLabel: 'Set due time',
    });
    if (ok) updateMut.mutate({ id: row.categoryId, payload: { tatHours: row.suggestedTatHours } });
  };

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <PeriodTabControl value={windowKey} options={WINDOW_OPTIONS} labels={WINDOW_LABELS} onChange={setWindowKey} />
        <ExportMenu
          className="sm:ml-auto"
          filename="ticket-category-tat"
          sheetName="Category TAT"
          title={exportTitle({ what: 'Ticket category TAT', period: WINDOW_LABELS[windowKey] })}
          getRows={() => exportRows}
          disabled={!data || rows.length === 0}
        />
      </div>

      {isPending && <PanelSkeleton />}

      {isError && <InlineError message="We couldn't load the category times. Check your connection and try again." onRetry={() => { void refetch(); }} />}

      {data && rows.length === 0 && (
        <EmptyState icon={ChartNoAxesColumn} title="No tickets in this period" description="Pick a longer period to see how each category is doing." />
      )}

      {data && total && rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className={TILE_CLASS}>
              <span className="t-meta font-display font-medium text-text-muted">Tickets</span>
              <span className="t-stat font-display font-bold tabular-nums text-text">{total.total}</span>
            </div>
            <div className={TILE_CLASS}>
              <span className="t-meta font-display font-medium text-text-muted">Closed</span>
              <span className="t-stat font-display font-bold tabular-nums text-text">{total.closed}</span>
            </div>
            <div className={TILE_CLASS}>
              <span className="t-meta font-display font-medium text-text-muted">Finished on time</span>
              <span className={`t-stat font-display font-bold tabular-nums ${SLA_TEXT[slaTone(total.slaMetPct)]}`}>{total.slaMetPct === null ? '–' : `${total.slaMetPct}%`}</span>
            </div>
            <div className={TILE_CLASS}>
              <span className="t-meta font-display font-medium text-text-muted">Typical time to finish</span>
              <span className="t-stat font-display font-bold tabular-nums text-text">{formatMinutes(total.completion.median)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
              <TatRowCard
                key={row.categoryId ?? 'none'}
                row={row}
                applying={updateMut.isPending && updateMut.variables?.id === row.categoryId}
                onApply={(picked) => { void apply(picked); }}
              />
            ))}
          </div>

          <p className="t-meta text-text-muted">
            Typical time is the middle value, so one very slow ticket does not skew it. A suggested due time covers 8 in 10 finished tickets and needs at least 5 of them.
          </p>
        </>
      )}
    </div>
  );
};
