import { lazy, Suspense, useId } from 'react';
import type { LucideIcon } from 'lucide-react';
import { StatCard, type Trend } from '../../dashboard';
import { ActiveRangeBadge, EntityIconTile, InlineError, PANEL_CLASS, Skeleton } from '../../../components';
import { defaultWindowLabel, describeLatestPeriod, NO_TREND, statCaption } from './analyticsDisplay';
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
  /** True while a refetch is running with the previous numbers still on screen. */
  isFetching?: boolean;
  errorMessage: string;
  /** Wired to the report query's refetch. */
  onRetry?: () => void;
  cards: KpiCardConfig[];
  chart: ReportTrendChartProps;
  from?: string;
  to?: string;
}

// Shared layout for every KPI group on the analytics page (header, stat cards, chart card, plus
// loading/error states) — each report just supplies its own data + chart. Adding another chart to
// the dashboard means writing one thin section component, not repeating this scaffolding.
export const KpiSectionShell = ({ icon: Icon, title, description, isPending, isError, isFetching = false, errorMessage, onRetry, cards, chart, from, to }: KpiSectionShellProps) => {
  const headingId = useId();
  const { label: periodCaption, isWholeRange } = describeLatestPeriod(chart.data as { bucket: string }[], chart.groupBy);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4 sm:gap-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <EntityIconTile icon={Icon} tone="primary" />
          <div className="min-w-0">
            <h2 id={headingId} className="text-lg sm:text-xl font-display font-bold text-text">{title}</h2>
            {/* Descriptive sentences are desktop-only: on a phone the numbers come first. */}
            <p className="hidden sm:block text-sm font-display text-text-muted leading-relaxed">{description}</p>
          </div>
        </div>

        <ActiveRangeBadge from={from} to={to} emptyLabel={defaultWindowLabel(chart.groupBy)} />
      </header>

      {isError ? (
        <InlineError message={errorMessage} onRetry={onRetry} />
      ) : (
        <div className={`flex flex-col gap-4 sm:gap-6 transition-opacity motion-reduce:transition-none ${isFetching && !isPending ? 'opacity-60' : ''}`}>
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
