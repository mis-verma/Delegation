import { lazy, Suspense, useId } from 'react';
import type { LucideIcon } from 'lucide-react';
import { StatCard, type Trend } from '../../dashboard';
import { ActiveRangeBadge, EntityIconTile, ExportMenu, InlineError, PANEL_CLASS, Skeleton } from '../../../components';
import { ApiError } from '../../../api/http';
import { exportTitle, type TableRows } from '../../../lib/exportTable';
import type { ScoreFigure, ScoreModule } from '../../../lib/scoreLabels';
import { CARD_PAD } from '../../scores/controlStyles';
import { HowCalculated } from '../../scores/HowCalculated';
import { UpdatingNote } from './UpdatingNote';
import { defaultWindowLabel, describeLatestPeriod, NO_TREND, statCaption, trendBucketLabel, visibleTrendPoints } from './analyticsDisplay';
import type { ReportTrendChartProps } from './ReportTrendChart';

const ReportTrendChart = lazy(() => import('./ReportTrendChart'));

const ChartSkeleton = () => (
  <div className="flex h-[260px] items-end gap-2 px-2" role="status" aria-label="Loading the chart">
    {[45, 70, 55, 85, 40, 65, 50, 75, 60, 35, 80, 55].map((h, i) => (
      <Skeleton key={i} className="flex-1 rounded-t-md rounded-b-none" style={{ height: `${h}%` }} />
    ))}
  </div>
);

export interface KpiCardConfig {
  icon: LucideIcon;
  iconTint: string;
  label: string;
  value: string | number;
  raw?: number | null;
  unit?: '%' | 'hours';
  hasData: boolean;
  trend: Trend;
  lowerIsBetter?: boolean;
  caption?: string;
  noDataText?: string;
  href?: string;
  how?: { figure: ScoreFigure; module?: ScoreModule };
}

interface KpiSectionShellProps {
  icon: LucideIcon;
  title: string;
  description: string;
  isPending: boolean;
  isError: boolean;
  errorMessage: string;
  error?: unknown;
  onRetry?: () => void;
  cards: KpiCardConfig[];
  chart: ReportTrendChartProps;
  summaryRows?: { bucket: string }[];
  from?: string;
  to?: string;
  updating?: boolean;
}

const GROUP_WORD: Record<ReportTrendChartProps['groupBy'], string> = { day: 'Day', week: 'Week', month: 'Month', year: 'Year', none: 'Whole period' };

const exportNumber = (value: number | null | undefined, unit: KpiCardConfig['unit']) => {
  if (value == null || !Number.isFinite(value)) return null;
  return unit === 'hours' ? Math.round(value * 10) / 10 : Math.round(value);
};

export const KpiSectionShell = ({ icon: Icon, title, description, isPending, isError, errorMessage, error, onRetry, cards, chart, summaryRows, from, to, updating = false }: KpiSectionShellProps) => {
  const headingId = useId();
  const { label: periodCaption, isWholeRange } = describeLatestPeriod(summaryRows ?? (chart.data as { bucket: string }[]), chart.groupBy);

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
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <EntityIconTile icon={Icon} tone="primary" />
          <div className="min-w-0">
            <h2 id={headingId} className="t-section font-display font-bold text-text">{title}</h2>
            <p className="hidden t-meta text-text-muted sm:block">{description}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <UpdatingNote show={updating} />
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
        <div className="flex flex-col gap-4">
          <div className={`grid grid-cols-2 gap-3 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1 ${cards.length >= 3 ? 'lg:grid-cols-3' : ''} ${cards.length >= 4 && cards.length % 4 === 0 ? 'xl:grid-cols-4' : ''}`}>
            {cards.map(({ hasData, noDataText, caption, trend, how, ...card }) => {
              const needsStatus = isPending || !hasData;
              return (
                <StatCard
                  key={card.label}
                  {...card}
                  labelAdornment={how ? <HowCalculated figure={how.figure} module={how.module} /> : undefined}
                  compact
                  isLoading={isPending}
                  trend={isWholeRange || !hasData ? NO_TREND : trend}
                  caption={needsStatus ? statCaption({ isPending, isError, hasData, noDataText: noDataText ?? 'No data for this period' }) : (caption ?? periodCaption)}
                />
              );
            })}
          </div>

          <div className={`${PANEL_CLASS} ${CARD_PAD}`}>
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
