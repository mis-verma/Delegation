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
  const { data: rows, isPending, isError, isFetching, refetch } = useTicketTatReportQuery(groupBy, from, to);
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
          // Open right now and past the due time. Tickets that were closed late are counted in the
          // next tile instead, so the two never overlap.
          label: 'Overdue',
          value: overdue.value ?? 0,
          hasData: overdue.value != null,
          noDataText: NOTHING_COUNTED,
          trend: overdue.trend,
          lowerIsBetter: true,
          caption: 'Open and past due',
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
        data: rows ?? [],
        groupBy,
        series: [{ key: 'completionRate', label: 'Closed vs raised', color: 'var(--color-primary-500)' }],
        valueSuffix: '%',
        // A ratio of closed to raised can pass 100, so the top of the axis follows the data.
        yDomain: [0, 'auto'],
      }}
    />
  );
};
