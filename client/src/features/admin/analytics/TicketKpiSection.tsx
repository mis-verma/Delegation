import { TicketCheck, Timer, AlertTriangle, Clock } from 'lucide-react';
import { KpiSectionShell } from './KpiSectionShell';
import { useTicketTatReportQuery } from './useAnalyticsQueries';
import { latestWithTrend, formatPercent, formatDuration } from './analyticsDisplay';
import type { GroupBy } from './GroupByControl';

interface TicketKpiSectionProps {
  groupBy: GroupBy;
  from?: string;
  to?: string;
  /** /admin/tickets (the org-wide destination) is PC/ADMIN-gated; everyone else uses /tickets,
   *  which the server already limits to what that person can see. */
  isOrgWideRole: boolean;
}

const NOTHING_COUNTED = 'Nothing counted in this period';

export const TicketKpiSection = ({ groupBy, from, to, isOrgWideRole }: TicketKpiSectionProps) => {
  // A picked range is one whole-range figure (the same as the headline strip above), so the cards
  // read a 'none' report; the chart still reads the grouped series so it has points to draw.
  const hasRange = Boolean(from && to);
  const chartQuery = useTicketTatReportQuery(groupBy, from, to);
  const cardQuery = useTicketTatReportQuery(hasRange ? 'none' : groupBy, from, to);
  const { data: rows } = cardQuery;
  const isPending = cardQuery.isPending || chartQuery.isPending;
  const isError = cardQuery.isError || chartQuery.isError;
  const isFetching = cardQuery.isFetching || chartQuery.isFetching;
  const refetch = () => Promise.all([cardQuery.refetch(), chartQuery.refetch()]);
  const closeRate = latestWithTrend(rows, 'completionRate', 'rate');
  const avgTime = latestWithTrend(rows, 'avgTatHours', 'count');
  const overdue = latestWithTrend(rows, 'overdueCount', 'count');
  const closedLate = latestWithTrend(rows, 'closedLateCount', 'count');

  // The ticket list reads ?quickFilter= (pending / completed / due / delayed). It has no date or
  // "closed late" filter yet, so those two tiles open the nearest list instead of the exact set.
  const base = isOrgWideRole ? '/admin/tickets' : '/tickets';

  return (
    <KpiSectionShell
      icon={TicketCheck}
      title="Tickets"
      description="Tickets closed compared with tickets raised in each period. The ratio can pass 100% when older tickets get closed."
      isPending={isPending}
      isError={isError}
      isFetching={isFetching}
      errorMessage="Could not load the ticket figures."
      onRetry={() => void refetch()}
      from={from}
      to={to}
      summaryRows={rows}
      cards={[
        {
          icon: TicketCheck,
          iconTint: 'text-primary-600 dark:text-primary-400',
          label: 'Closed vs raised',
          value: formatPercent(closeRate.value),
          hasData: closeRate.value != null,
          noDataText: NOTHING_COUNTED,
          trend: closeRate.trend,
          href: `${base}?quickFilter=completed`,
        },
        {
          icon: Timer,
          iconTint: 'text-coral-600 dark:text-coral-400',
          // Elapsed time from raised to closed, for tickets closed in the period. Lower is better.
          label: 'Avg time to close',
          value: formatDuration(avgTime.value),
          hasData: avgTime.value != null,
          noDataText: 'No tickets closed in this period',
          trend: avgTime.trend,
          lowerIsBetter: true,
          href: base,
        },
        {
          icon: AlertTriangle,
          iconTint: 'text-warning',
          // Raised in the period, and open and past due right now. Tickets that were closed late are
          // counted in the next tile instead, so the two never overlap. Named so it is not mistaken
          // for the "Overdue now" figure at the top of the page, which ignores the period.
          label: 'Raised this period, now overdue',
          value: overdue.value ?? 0,
          hasData: overdue.value != null,
          noDataText: NOTHING_COUNTED,
          trend: overdue.trend,
          lowerIsBetter: true,
          caption: 'Still open and past due',
          href: `${base}?quickFilter=delayed`,
        },
        {
          icon: Clock,
          iconTint: 'text-danger',
          label: 'Closed late',
          value: closedLate.value ?? 0,
          hasData: closedLate.value != null,
          noDataText: NOTHING_COUNTED,
          trend: closedLate.trend,
          lowerIsBetter: true,
          caption: 'Closed after the due time',
          href: `${base}?quickFilter=completed`,
        },
      ]}
      chart={{
        data: chartQuery.data ?? [],
        groupBy,
        series: [{ key: 'completionRate', label: 'Closed vs raised', color: 'var(--color-primary-500)' }],
        valueSuffix: '%',
        // A ratio of closed to raised can pass 100, so the top of the axis follows the data, but
        // never past 200% (a gap where nothing was raised comes back as no value, not 0%).
        yDomain: [0, (max: number) => Math.min(Math.max(Math.ceil(max / 10) * 10, 100), 200)],
      }}
    />
  );
};
