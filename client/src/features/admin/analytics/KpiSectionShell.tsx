import { lazy, Suspense, useId } from 'react';
import type { LucideIcon } from 'lucide-react';
import { StatCard, type Trend } from '../../dashboard';
import { ActiveRangeBadge, EntityIconTile, ExportMenu, InlineError, PANEL_CLASS, Skeleton } from '../../../components';
import { ApiError } from '../../../api/http';
import { exportTitle, type TableRows } from '../../../lib/exportTable';
import { defaultWindowLabel, describeLatestPeriod, NO_TREND, statCaption, trendBucketLabel, visibleTrendPoints } from './analyticsDisplay';
import type { ReportTrendChartProps } from './ReportTrendChart';

// The chart pulls in recharts, which is by far the heaviest thing on this page, so it loads on its
// own and the cards above it can paint first.
const ReportTrendChart = lazy(() => import('./ReportTrendChart'));

// Chart-shaped, not a spinner — every sibling card on this page (gauges, leader rows, store
// tables) already loads in with a placeholder shaped like its real content.
const ChartSkeleton = () => (
  <div className="h-[260px] flex items-end gap-2 px-2">
    {[45, 70, 55, 85, 40, 65, 50, 75, 60, 35, 80, 55].map((h, i) => (
      <Skeleton key={i} className="flex-1 rounded-t-md rounded-b-none" style={{ height: `${h}%` }} />
    ))}
  </div>
);

interface KpiCardConfig {
  icon: LucideIcon;
  iconTint: string;
  label: string;
  /** `number` lets StatCard apply thousands separators; pre-formatted strings ("85%", "3.5 h") pass through. */
  value: string | number;
  /** The figure as a plain number for the export (85 for "85%", 3.5 for "3.5 h"). Defaults to `value` when that is a number. */
  raw?: number | null;
  /** What `raw` counts, written into the export's column name. */
  unit?: '%' | 'hours';
  /** False when the report came back but this figure has nothing behind it (shown as "No data"). */
  hasData: boolean;
  trend: Trend;
  /** For metrics where rising is bad news (Overdue, Avg time to close) — colours the trend badge correctly. */
  lowerIsBetter?: boolean;
  /** Qualifier under the trend badge. Defaults to the period the figure covers, e.g. "Oct 2026 vs Sep 2026". */
  caption?: string;
  /** Text shown instead of the caption when `hasData` is false. */
  noDataText?: string;
  /** Where the card goes when clicked. Omitted entirely (not just falsy) when no destination is
   *  reachable for the current viewer. */
  href?: string;
}

interface KpiSectionShellProps {
  icon: LucideIcon;
  title: string;
  description: string;
  isPending: boolean;
  isError: boolean;
  errorMessage: string;
  /** The failed request's error. A 400 carries a reason the viewer can act on ("Pick a period of 366 days or less."). */
  error?: unknown;
  /** Wired to the report query's refetch. */
  onRetry?: () => void;
  cards: KpiCardConfig[];
  chart: ReportTrendChartProps;
  /** The rows the cards read, when they differ from the chart's (a picked range: one whole-range row). */
  summaryRows?: { bucket: string }[];
  from?: string;
  to?: string;
}

const GROUP_WORD: Record<ReportTrendChartProps['groupBy'], string> = { day: 'Day', week: 'Week', month: 'Month', year: 'Year', none: 'Whole period' };

const exportNumber = (value: number | null | undefined, unit: KpiCardConfig['unit']) => {
  if (value == null || !Number.isFinite(value)) return null;
  return unit === 'hours' ? Math.round(value * 10) / 10 : Math.round(value);
};

// Shared layout for every KPI group on the analytics page (header, stat cards, chart card, plus
// loading/error states) — each report just supplies its own data + chart. Adding another chart to
// the dashboard means writing one thin section component, not repeating this scaffolding.
export const KpiSectionShell = ({ icon: Icon, title, description, isPending, isError, errorMessage, error, onRetry, cards, chart, summaryRows, from, to }: KpiSectionShellProps) => {
  const headingId = useId();
  const { label: periodCaption, isWholeRange } = describeLatestPeriod(summaryRows ?? (chart.data as { bucket: string }[]), chart.groupBy);

  // The cards as label and value, then the trend as drawn: one row per period per line.
  const exportRows = () => {
    const figures: TableRows = cards.map((c) => {
      const raw = c.raw !== undefined ? c.raw : typeof c.value === 'number' ? c.value : null;
      const showTrend = c.hasData && !isWholeRange && c.trend.label !== NO_TREND.label;
      return [`${c.label}${c.unit === '%' ? ' %' : c.unit === 'hours' ? ' (hours)' : ''}`, c.hasData ? exportNumber(raw, c.unit) : null, c.caption ?? periodCaption, showTrend ? c.trend.label : ''];
    });
    const points = visibleTrendPoints(chart.data, chart.series.map((x) => x.key), chart.groupBy);
    const percent = chart.valueSuffix === '%';
    const trend: TableRows = points.flatMap((row) =>
      chart.series.map((x) => {
        const v = row[x.key];
        return [trendBucketLabel(String(row.bucket), chart.groupBy), x.label, typeof v === 'number' ? exportNumber(v, percent ? '%' : 'hours') : null];
      }),
    );
    const rows: TableRows = [
      ['Figure', 'Value', 'Covers', 'Change vs previous'],
      ...figures,
      [],
      [`Trend${percent ? ' (%)' : ''}`],
      ['Period', 'Line', 'Value'],
      ...trend,
    ];
    return { rows, count: figures.length + trend.length };
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4 sm:gap-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <EntityIconTile icon={Icon} tone="primary" />
          <div className="min-w-0">
            <h2 id={headingId} className="t-section font-display font-bold text-text">{title}</h2>
            {/* Descriptive sentences are desktop-only: on a phone the numbers come first. */}
            <p className="hidden sm:block text-sm font-display text-text-muted leading-relaxed">{description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ActiveRangeBadge from={from} to={to} emptyLabel={defaultWindowLabel(chart.groupBy)} />
          <ExportMenu
            disabled={isPending || isError}
            aria-label={`Export the ${title.toLowerCase()} figures`}
            filename={`overview-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`}
            sheetName={title}
            title={exportTitle({
              what: `Overview, ${title}`,
              from,
              to,
              period: from && to ? undefined : defaultWindowLabel(chart.groupBy),
              filters: { 'Grouped by': GROUP_WORD[chart.groupBy] },
            })}
            getRows={exportRows}
          />
        </div>
      </header>

      {isError ? (
        <InlineError message={error instanceof ApiError && error.status === 400 ? error.message : errorMessage} onRetry={error instanceof ApiError && error.status === 400 ? undefined : onRetry} />
      ) : (
        <div className="flex flex-col gap-4 sm:gap-6">
          {/* Two tiles per row on a phone (a lone last tile spans the row), then the grid opens up:
              caps at 2 columns for a 2-card section instead of reserving a column that sits empty,
              3 columns from `lg`, and one row of 4 at `xl` only when the cards divide evenly by 4
              (a 6-card section stays at 3 so the last row is not left half empty). */}
          <div className={`grid grid-cols-2 gap-3 sm:gap-4 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1 ${cards.length >= 3 ? 'lg:grid-cols-3' : ''} ${cards.length >= 4 && cards.length % 4 === 0 ? 'xl:grid-cols-4' : ''}`}>
            {cards.map(({ hasData, noDataText, caption, trend, ...card }) => {
              const needsStatus = isPending || !hasData;
              return (
                <StatCard
                  key={card.label}
                  {...card}
                  compact
                  isLoading={isPending}
                  trend={isWholeRange || !hasData ? NO_TREND : trend}
                  caption={needsStatus ? statCaption({ isPending, isError, hasData, noDataText: noDataText ?? 'No data for this period' }) : (caption ?? periodCaption)}
                />
              );
            })}
          </div>

          <div className={`${PANEL_CLASS} p-4 sm:p-5`}>
            {isPending ? (
              <ChartSkeleton />
            ) : (
              <Suspense fallback={<ChartSkeleton />}>
                <ReportTrendChart {...chart} />
              </Suspense>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
