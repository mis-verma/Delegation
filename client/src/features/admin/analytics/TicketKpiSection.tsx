import { useMemo } from 'react';
import { TicketCheck, Timer, AlertTriangle, Clock } from 'lucide-react';
import { KpiSectionShell } from './KpiSectionShell';
import { useTicketTatReportQuery } from './useAnalyticsQueries';
import { bucketRange, latestWithTrend, formatPercent, formatDuration, slaMetRate, withoutEmptyTail, NO_TREND } from './analyticsDisplay';
import { useOverviewScores } from './useOverviewScores';
import { SCORE_LABEL } from '../../../lib/scoreLabels';
import { orgDayWindow } from '../../dashboard/scoreDrill';
import type { GroupBy } from './GroupByControl';

interface TicketKpiSectionProps {
  groupBy: GroupBy;
  from?: string;
  to?: string;
  windowFrom?: string;
  windowTo?: string;
  isOrgWideRole: boolean;
}

const NOTHING_COUNTED = 'Nothing counted in this period';

export const TicketKpiSection = ({ groupBy, from, to, windowFrom, windowTo, isOrgWideRole }: TicketKpiSectionProps) => {
  const hasRange = Boolean(from && to);
  const chartQuery = useTicketTatReportQuery(groupBy, from, to);
  const cardQuery = useTicketTatReportQuery(hasRange ? 'none' : groupBy, from, to);
  const { data: rows } = cardQuery;
  const scores = useOverviewScores(windowFrom, windowTo);
  const ticket = scores.total?.ticket;
  const scoresLoading = scores.isPending && !scores.data;
  const isPending = cardQuery.isPending || chartQuery.isPending || scoresLoading;
  const isError = cardQuery.isError || chartQuery.isError || (scores.isError && !scores.data);
  const refetch = () => Promise.all([cardQuery.refetch(), chartQuery.refetch(), ...(scores.isError ? [scores.refetch()] : [])]);
  const onTimeValue = ticket && ticket.done > 0 ? ticket.onTimeOfFinishedPct : null;
  const windowText = scores.win?.label;
  const chartData = useMemo(() => (chartQuery.data ?? []).map((r) => ({ ...r, onTimeRate: slaMetRate(r) })), [chartQuery.data]);
  const avgTime = latestWithTrend(rows, 'avgTatHours', 'count');
  const overdue = latestWithTrend(rows, 'overdueCount', 'count');

  const base = isOrgWideRole ? '/admin/tickets' : '/tickets';
  const slaHref = (sla: 'closed_late' | 'closed_on_time') => {
    let window: { from: string; to: string } | null = null;
    if (scores.win) {
      const { start, end } = orgDayWindow(scores.win.from, scores.win.to);
      window = { from: start, to: end };
    } else if (from && to) window = { from, to };
    else if (rows) {
      const trimmed = withoutEmptyTail(rows);
      const latest = trimmed[trimmed.length - 1];
      window = latest ? bucketRange(latest.bucket, groupBy) : null;
    }
    const params = new URLSearchParams({ sla });
    if (window) {
      params.set('dueFrom', window.from);
      params.set('dueTo', window.to);
    }
    return `${base}?${params.toString()}`;
  };
  const lateHref = slaHref('closed_late');
  const onTimeHref = slaHref('closed_on_time');

  return (
    <KpiSectionShell
      icon={TicketCheck}
      title="Tickets"
      description="How many tickets were closed by their due time, how long they take to close, and what is overdue."
      isPending={isPending}
      isError={isError}
      errorMessage="Could not load the ticket figures."
      error={cardQuery.error ?? chartQuery.error ?? scores.error}
      updating={scores.updating}
      onRetry={() => void refetch()}
      from={from}
      to={to}
      summaryRows={rows}
      cards={[
        {
          icon: TicketCheck,
          iconTint: 'text-primary-600 dark:text-primary-400',
          label: SCORE_LABEL.onTime,
          how: { figure: 'onTime', module: 'ticket' },
          value: formatPercent(onTimeValue),
          raw: onTimeValue,
          unit: '%',
          hasData: onTimeValue != null,
          noDataText: 'No closed tickets with a due time',
          trend: NO_TREND,
          caption: windowText ? `Of tickets closed, closed by the due time, ${windowText}` : 'Of tickets closed, closed by the due time',
          href: onTimeHref,
        },
        {
          icon: Timer,
          iconTint: 'text-coral-600 dark:text-coral-400',
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
          label: `Closed ${SCORE_LABEL.late.toLowerCase()}`,
          value: ticket?.late ?? 0,
          hasData: ticket != null,
          noDataText: NOTHING_COUNTED,
          trend: NO_TREND,
          lowerIsBetter: true,
          caption: 'Closed after the due time',
          href: lateHref,
        },
      ]}
      chart={{
        data: chartData,
        groupBy,
        series: [{ key: 'onTimeRate', label: SCORE_LABEL.onTime, color: 'var(--color-primary-500)' }],
        valueSuffix: '%',
        yDomain: [0, 100],
      }}
    />
  );
};
