import { TicketCheck, Timer, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router';
import { KpiSectionShell } from './KpiSectionShell';
import { ReportTrendChart } from './ReportTrendChart';
import { useTicketTatReportQuery } from './useAnalyticsQueries';
import { latestWithTrend } from './analyticsDisplay';
import type { GroupBy } from './GroupByControl';

interface TicketKpiSectionProps {
  groupBy: GroupBy;
  from?: string;
  to?: string;
  /** /admin/tickets (this card's click destination) is PC/ADMIN-gated. */
  isOrgWideRole: boolean;
}

export const TicketKpiSection = ({ groupBy, from, to, isOrgWideRole }: TicketKpiSectionProps) => {
  const navigate = useNavigate();
  const { data: rows, isPending, isError } = useTicketTatReportQuery(groupBy, from, to);
  const closeRate = latestWithTrend(rows, 'completionRate', 'rate');
  const avgTat = latestWithTrend(rows, 'avgTatHours', 'count');
  const overdue = latestWithTrend(rows, 'overdueCount', 'count');
  // Each bucket here only carries a formatted label (e.g. "2026-09"), not real start/end
  // timestamps, so there's no safe way to reconstruct the exact date window a DrilldownModal
  // fetch would need to match "closed AND overdue-at-close, this specific bucket" without risking
  // a subtly wrong result — a plain navigate to the real ticket list is the honest destination
  // for all three cards here, same call as the KPI sections above.
  const onClick = isOrgWideRole ? () => navigate('/admin/tickets') : undefined;

  return (
    <KpiSectionShell
      icon={TicketCheck}
      title="Complaints (Tickets)"
      description="Close rate is closed-this-period ÷ raised-this-period — a throughput ratio, not a per-ticket cohort rate, since a ticket can be raised in one period and closed in another."
      isPending={isPending}
      isError={isError}
      errorMessage="Failed to load ticket data."
      from={from}
      to={to}
      cards={[
        {
          icon: TicketCheck,
          iconTint: 'text-primary-600 dark:text-primary-400',
          label: 'Close rate',
          value: closeRate.value != null ? `${closeRate.value}%` : '—',
          trend: closeRate.trend,
          onClick,
        },
        {
          icon: Timer,
          iconTint: 'text-coral-600 dark:text-coral-400',
          label: 'Avg TAT',
          value: avgTat.value != null ? `${avgTat.value}h` : '—',
          trend: avgTat.trend,
          // A rising turnaround time means tickets are taking longer — the arrow follows the
          // number, but green belongs on the downward move here.
          lowerIsBetter: true,
          onClick,
        },
        {
          icon: AlertTriangle,
          iconTint: 'text-warning',
          // Passed as a raw number, not a template string — StatCard formats numbers (thousands
          // separators); pre-stringifying it here opted this card out of that for no reason.
          label: 'Overdue',
          value: overdue.value ?? '—',
          trend: overdue.trend,
          lowerIsBetter: true,
          // Distinguishes this from the "Overdue" card in the summary strip above, which is a
          // different measurement despite the identical label: that one is a live, org-wide count
          // across every ticket (open or closed) in range; this one is scoped to tickets that were
          // both closed AND overdue-at-close, within only the latest bucket of the selected
          // grouping — the same population `tatReport` buckets everything else in this section by.
          caption: 'Closed overdue, latest period',
          onClick,
        },
      ]}
      chart={
        <ReportTrendChart
          data={rows ?? []}
          series={[{ key: 'completionRate', label: 'Close rate %', color: 'var(--color-primary-500)' }]}
          valueSuffix="%"
          yDomain={[0, 100]}
        />
      }
    />
  );
};
