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
  /** The Overview's window (ISO instants): the score figures (on time, closed late) cover it, picked range or not. */
  windowFrom?: string;
  windowTo?: string;
  /** /admin/tickets (the org-wide destination) is PC/ADMIN-gated; everyone else uses /tickets,
   *  which the server already limits to what that person can see. */
  isOrgWideRole: boolean;
}

const NOTHING_COUNTED = 'Nothing counted in this period';

export const TicketKpiSection = ({ groupBy, from, to, windowFrom, windowTo, isOrgWideRole }: TicketKpiSectionProps) => {
  // A picked range is one whole-range figure (the same as the headline strip above), so the cards
  // read a 'none' report; the chart still reads the grouped series so it has points to draw.
  const hasRange = Boolean(from && to);
  const chartQuery = useTicketTatReportQuery(groupBy, from, to);
  const cardQuery = useTicketTatReportQuery(hasRange ? 'none' : groupBy, from, to);
  const { data: rows } = cardQuery;
  // The score figures (on time, closed late) come from the score explorer for the whole window, the same answer the
  // Scores page shows. The report above still feeds the trend line, the average time to close and the overdue count.
  const scores = useOverviewScores(windowFrom, windowTo);
  const ticket = scores.total?.ticket;
  const scoresLoading = scores.isPending && !scores.data;
  const isPending = cardQuery.isPending || chartQuery.isPending || scoresLoading;
  const isError = cardQuery.isError || chartQuery.isError || (scores.isError && !scores.data);
  const refetch = () => Promise.all([cardQuery.refetch(), chartQuery.refetch(), ...(scores.isError ? [scores.refetch()] : [])]);
  // Of the tickets closed in the window that had a due time, the share closed by it. Never above 100%, unlike
  // closed against raised, which passes 100% whenever older tickets get closed.
  const onTimeValue = ticket && ticket.done > 0 ? ticket.onTimeOfFinishedPct : null;
  const windowText = scores.win?.label;
  const chartData = useMemo(() => (chartQuery.data ?? []).map((r) => ({ ...r, onTimeRate: slaMetRate(r) })), [chartQuery.data]);
  const avgTime = latestWithTrend(rows, 'avgTatHours', 'count');
  const overdue = latestWithTrend(rows, 'overdueCount', 'count');

  // The ticket list reads ?quickFilter= (pending / completed / due / delayed) and, for a score link,
  // ?sla=closed_late with the window the tickets were due in.
  const base = isOrgWideRole ? '/admin/tickets' : '/tickets';
  // The days the "Closed on time" and "Closed late" figures cover: the picked range, or else the newest bucket's own
  // days. Both open the tickets that were DUE in that window, filtered the same way the figure counts them.
  const slaHref = (sla: 'closed_late' | 'closed_on_time') => {
    let window: { from: string; to: string } | null = null;
    // The explorer's days when it has them, so the list is the tickets the figure counted.
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
          // One figure for the whole window: no previous-period change beside it.
          trend: NO_TREND,
          caption: windowText ? `Of tickets closed, closed by the due time, ${windowText}` : 'Of tickets closed, closed by the due time',
          href: onTimeHref,
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
