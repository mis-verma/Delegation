import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { ClipboardCheck, ShieldCheck, AlertTriangle, Camera } from 'lucide-react';
import { StatCard, pointDelta, trendFrom } from '../../dashboard';
import { DrilldownModal, type DrilldownRow } from '../../dashboard/DrilldownModal';
import { useAuth } from '../../../context/AuthContext';
import { ticketApi } from '../../../api/ticket';
import { handleQueryRetry } from '../../../lib/queryHelpers';
import { useTaskComplianceReportQuery, useTicketTatReportQuery, useChecklistInstanceComplianceReportQuery, useTicketOwnerStatsQuery } from './useAnalyticsQueries';
import { latestWithTrend, slaMetRate } from './analyticsDisplay';
import type { GroupBy } from './GroupByControl';
import type { Ticket } from '../../../api/ticket';

interface AnalyticsSummaryStripProps {
  groupBy: GroupBy;
  from?: string;
  to?: string;
}

const DRILLDOWN_FETCH_LIMIT = 25;

const ticketRow = (t: Ticket): DrilldownRow => ({
  id: t.id,
  title: t.title,
  link: `/tickets?open=${t.id}`,
  createdAt: t.createdAt,
  completed: t.status === 'CLOSED',
  overdue: t.isOverdue,
});

type DrilldownKind = 'on-time' | 'overdue';

export const AnalyticsSummaryStrip = ({ groupBy, from, to }: AnalyticsSummaryStripProps) => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [drilldownKind, setDrilldownKind] = useState<DrilldownKind | null>(null);
  const { data: taskRows } = useTaskComplianceReportQuery(groupBy, from, to);
  const { data: ticketRows } = useTicketTatReportQuery(groupBy, from, to);
  const { data: instanceRows } = useChecklistInstanceComplianceReportQuery(groupBy, from, to);
  // Real org-wide totals (see ticket.service.ts#ownerStats) — the Overdue count used to be a
  // client-side count over a single newest-100-tickets page, silently undercounting for any org
  // past that size.
  const { data: orgRows } = useTicketOwnerStatsQuery('org', from, to);
  const orgStats = orgRows?.[0];

  // A real previous-period comparison for the Overdue count above — only well-defined when an
  // explicit range is picked (an equal-length window immediately before it exists then). With no
  // range selected the value is an unbounded all-time total, which has no meaningful "previous
  // window" to compare against, so the trend badge below falls back to a plain '—' instead of
  // guessing. This replaces reusing tatReport's overdueCount trend, which was scoped to CLOSED
  // tickets only (by closedAt) — a different population than the org-wide (createdAt, open+closed)
  // count actually shown, so the arrow could point the wrong way relative to the number beside it.
  const previousRange = from && to ? (() => {
    const spanMs = new Date(to).getTime() - new Date(from).getTime();
    if (spanMs <= 0) return null;
    return {
      prevFrom: new Date(new Date(from).getTime() - spanMs).toISOString(),
      prevTo: new Date(new Date(from).getTime() - 1).toISOString(),
    };
  })() : null;
  const { data: prevOrgRows } = useTicketOwnerStatsQuery('org', previousRange?.prevFrom, previousRange?.prevTo);
  const prevOrgStats = previousRange ? prevOrgRows?.[0] : undefined;

  // "On-time completion" is deliberately the same closed-tickets SLA definition and data source
  // as ComplianceGaugeRail's own "On-time" gauge (both read off tatReport's latest bucket) — this
  // used to instead be a client-side rate over ALL tickets (open included) from a separate,
  // capped ticket page, so the two cards could show two different "on-time" numbers for what
  // looked like the same metric side by side on the same screen.
  const latestTicket = ticketRows?.[ticketRows.length - 1];
  const previousTicket = ticketRows && ticketRows.length > 1 ? ticketRows[ticketRows.length - 2] : undefined;
  const previousSlaMet = slaMetRate(previousTicket);
  const currentBucketSlaMet = slaMetRate(latestTicket);
  const slaMetTrend = currentBucketSlaMet != null && previousSlaMet != null
    ? pointDelta(currentBucketSlaMet, previousSlaMet)
    : { direction: 'up' as const, label: currentBucketSlaMet != null ? 'New' : '—' };

  // Trend badge only — how the overdue count is *moving*, compared against the equal-length
  // window immediately before the current one (see previousRange above). No badge shown at all
  // when there's no previous window to compare against.
  const overdueTrend = prevOrgStats
    ? trendFrom(orgStats?.overdueCount ?? 0, prevOrgStats.overdueCount)
    : { direction: 'up' as const, label: '—' };

  const checklistCompletion = latestWithTrend(taskRows, 'completionRate', 'rate');

  const taskQuality = latestWithTrend(taskRows, 'qualityRate', 'rate');
  const instanceQuality = latestWithTrend(instanceRows, 'qualityRate', 'rate');
  const proofCompliance = taskQuality.value != null && instanceQuality.value != null
    ? Math.round((taskQuality.value + instanceQuality.value) / 2)
    : taskQuality.value ?? instanceQuality.value;
  const proofTrend = taskQuality.value != null ? taskQuality.trend : instanceQuality.trend;

  // Fetched on demand, only once a card is actually clicked — a real, filtered ticket list
  // (status=CLOSED & not overdue, or isOverdue) scoped to the exact same date range as the stat
  // above it, instead of reusing whatever capped page happened to already be loaded elsewhere on
  // the page (which could show a different, unrelated set of tickets than the number implied).
  const { data: drilldownPage, isPending: drilldownPending } = useQuery({
    queryKey: ['analytics', 'ticket-drilldown', drilldownKind, from, to],
    // 'on-time' is scoped by closedAt to match tatReport's own closedAt-scoped bucketing (see
    // ticket.service.ts#tatReport and #list) — otherwise a ticket created before `from` but closed
    // within range (or vice versa) could count toward the percentage without ever appearing here.
    queryFn: () => drilldownKind === 'on-time'
      ? ticketApi.getAll(1, DRILLDOWN_FETCH_LIMIT, 'CLOSED', undefined, false, from, to, 'closedAt')
      : ticketApi.getAll(1, DRILLDOWN_FETCH_LIMIT, undefined, undefined, true, from, to),
    enabled: !!token && drilldownKind != null,
    retry: handleQueryRetry,
  });

  const drilldownMeta = drilldownKind === 'on-time'
    ? { title: 'On-time tickets', href: '/admin/tickets' }
    : drilldownKind === 'overdue'
      ? { title: 'Overdue tickets', href: '/admin/tickets' }
      : null;
  const drilldownRows = drilldownPage?.data.map(ticketRow) ?? [];
  const drilldownTotal = drilldownPage?.meta?.total ?? drilldownRows.length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
      <StatCard
        icon={ShieldCheck}
        label="On-time completion"
        value={currentBucketSlaMet != null ? `${currentBucketSlaMet}%` : '—'}
        trend={slaMetTrend}
        highlight
        decorative
        onClick={() => setDrilldownKind('on-time')}
      />
      <StatCard
        icon={ClipboardCheck}
        iconTint="text-primary-600 dark:text-primary-400"
        label="Checklist completion"
        value={checklistCompletion.value != null ? `${checklistCompletion.value}%` : '—'}
        trend={checklistCompletion.trend}
        // No raw item list available here (this is an averaged completion rate across every
        // delegation's own sub-checklist items, not a list of records) — clicking goes straight
        // to the page that explains it instead of a fabricated drill-down.
        onClick={() => navigate('/admin/scheduled-checklists')}
      />
      <StatCard
        icon={AlertTriangle}
        iconTint="text-warning"
        label="Overdue"
        value={orgStats ? orgStats.overdueCount : '—'}
        trend={overdueTrend}
        // A rising overdue count is bad news — without this the trend badge coloured a growing
        // backlog green and pointed the arrow up as if it were an improvement.
        lowerIsBetter
        onClick={() => setDrilldownKind('overdue')}
      />
      <StatCard
        icon={Camera}
        iconTint="text-success"
        label="Proof compliance"
        value={proofCompliance != null ? `${proofCompliance}%` : '—'}
        trend={proofTrend}
        // Same as Checklist completion above — an averaged rate, not a literal item list.
        onClick={() => navigate('/admin/checklist-compliance')}
      />

      {drilldownMeta && (
        <DrilldownModal
          open
          onClose={() => setDrilldownKind(null)}
          title={drilldownMeta.title}
          icon={ShieldCheck}
          rows={drilldownRows}
          isLoading={drilldownPending}
          cappedNote={!drilldownPending && drilldownTotal > drilldownRows.length ? `Showing the newest ${drilldownRows.length} of ${drilldownTotal}` : undefined}
          viewAllHref={drilldownMeta.href}
          viewAllLabel="View all tickets"
        />
      )}
    </div>
  );
};
