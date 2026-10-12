import { useMemo } from 'react';
import { TicketCheck, Timer, AlertTriangle, Clock } from 'lucide-react';
import { KpiSectionShell } from './KpiSectionShell';
import { useTicketTatReportQuery } from './useAnalyticsQueries';
import { bucketRange, latestWithTrend, formatPercent, formatDuration, slaMetRate, slaMetWithTrend, withoutEmptyTail } from './analyticsDisplay';
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
  const refetch = () => Promise.all([cardQuery.refetch(), chartQuery.refetch()]);
  // Of the tickets closed in the period that had a due time, the share closed by it. Never above 100%, unlike
  // closed against raised, which passes 100% whenever older tickets get closed.
  const onTime = slaMetWithTrend(rows);
  const chartData = useMemo(() => (chartQuery.data ?? []).map((r) => ({ ...r, onTimeRate: slaMetRate(r) })), [chartQuery.data]);
  const avgTime = latestWithTrend(rows, 'avgTatHours', 'count');
  const overdue = latestWithTrend(rows, 'overdueCount', 'count');
  const closedLate = latestWithTrend(rows, 'closedLateCount', 'count');

  // The ticket list reads ?quickFilter= (pending / completed / due / delayed) and, for a score link,
  // ?sla=closed_late with the window the tickets were due in.
  const base = isOrgWideRole ? '/admin/tickets' : '/tickets';
  // The days the "Closed late" figure covers: the picked range, or else the newest bucket's own days.
  const lateHref = (() => {
    let window: { from: string; to: string } | null = null;
    if (from && to) window = { from, to };
    else if (rows) {
      const trimmed = withoutEmptyTail(rows);
      const latest = trimmed[trimmed.length - 1];
      window = latest ? bucketRange(latest.bucket, groupBy) : null;
    }
    const params = new URLSearchParams({ sla: 'closed_late' });
    if (window) {
      params.set('dueFrom', window.from);
      params.set('dueTo', window.to);
    }
    return `${base}?${params.toString()}`;
  })();

  return (
    <KpiSectionShell
      icon={TicketCheck}
      title="Tickets"
      description="How many tickets were closed by their due time, how long they take to close, and what is overdue."
      isPending={isPending}
      isError={isError}
      errorMessage="Could not load the ticket figures."
      error={cardQuery.error ?? chartQuery.error}
      onRetry={() => void refetch()}
      from={from}
      to={to}
      summaryRows={rows}
      cards={[
        {
          icon: TicketCheck,
          iconTint: 'text-primary-600 dark:text-primary-400',
          label: 'Closed on time',
          value: formatPercent(onTime.value),
          raw: onTime.value,
          unit: '%',
          hasData: onTime.value != null,
          noDataText: 'No closed tickets with a due time',
          trend: onTime.trend,
          caption: 'Of tickets closed, closed by the due time',
          href: `${base}?quickFilter=completed`,
        },
        {
          icon: Timer,
          iconTint: 'text-coral-600 dark:text-coral-400',
          // Elapsed time from raised to closed, for tickets closed in the period. Lower is better.
          label: 'Avg time to close',
          value: formatDuration(avgTime.value),
          raw: avgTime.value,
          unit: 'hours',
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
          href: lateHref,
        },
      ]}
      chart={{
        data: chartData,
        groupBy,
        series: [{ key: 'onTimeRate', label: 'Closed on time', color: 'var(--color-primary-500)' }],
        valueSuffix: '%',
        yDomain: [0, 100],
      }}
    />
  );
};
