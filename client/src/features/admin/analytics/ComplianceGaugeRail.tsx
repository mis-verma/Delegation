import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, ClipboardCheck, Gauge as GaugeIcon, ShieldCheck } from 'lucide-react';
import { RadialGauge, EntityIconTile, Skeleton } from '../../../components';
import { DrilldownModal, type DrilldownRow } from '../../dashboard/DrilldownModal';
import { useAuth } from '../../../context/AuthContext';
import { ticketApi, type Ticket } from '../../../api/ticket';
import { handleQueryRetry } from '../../../lib/queryHelpers';
import { useTaskComplianceReportQuery, useTicketTatReportQuery } from './useAnalyticsQueries';
import { latestWithTrend, slaMetRate } from './analyticsDisplay';
import type { GroupBy } from './GroupByControl';

interface ComplianceGaugeRailProps {
  groupBy: GroupBy;
  from?: string;
  to?: string;
}

interface GaugeProps {
  icon: LucideIcon;
  label: string;
  percent: number | null;
  gradientFrom: string;
  gradientTo: string;
  /** Omitted (not just falsy) when this ring has nowhere real to send the viewer — see each
   *  caller's own comment for why. */
  onClick?: () => void;
}

// Navy for the checklist ring, gold for the on-time ring — two rings the same flat color read as
// one metric split in half rather than two distinct measures, and a real two-stop gradient (not
// just a solid fill) is what makes each ring itself look like a finished chart rather than a
// thick outline.
const Gauge = ({ icon: Icon, label, percent, gradientFrom, gradientTo, onClick }: GaugeProps) => {
  const content = (
    <>
      <div className={onClick ? 'transition-transform duration-300 group-hover/gauge:-translate-y-0.5 group-hover/gauge:scale-[1.03]' : undefined}>
        <RadialGauge percent={percent ?? 0} size={128} gradientFrom={gradientFrom} gradientTo={gradientTo}>
          <span className="text-xl font-display font-bold text-text tracking-tight tabular-nums">
            {percent != null ? `${percent}%` : '—'}
          </span>
        </RadialGauge>
      </div>
      <span className="flex items-center gap-1.5 text-xs font-display font-medium text-text-muted">
        <Icon size={13} />
        {label}
      </span>
    </>
  );

  // Same clickable-gauge affordance TeamProgressCard's own RadialGauge already uses on the
  // Dashboard — one consistent "gauges are tappable when they represent something to open" rule
  // instead of this rail's rings being the one place gauges are just decoration.
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}, ${percent != null ? `${percent}%` : 'no data'}. Tap for details.`}
      className="group/gauge flex flex-col items-center gap-2 flex-1 outline-none cursor-pointer rounded-2xl focus-visible:ring-2 focus-visible:ring-primary-500/40"
    >
      {content}
    </button>
  ) : (
    <div className="flex flex-col items-center gap-2 flex-1">{content}</div>
  );
};

const GaugeSkeleton = () => (
  <div className="flex flex-col items-center gap-2 flex-1">
    <Skeleton className="rounded-full" style={{ width: 128, height: 128 }} />
    <Skeleton className="h-3 w-16 rounded" />
  </div>
);

const DRILLDOWN_FETCH_LIMIT = 25;

const ticketRow = (t: Ticket): DrilldownRow => ({
  id: t.id,
  title: t.title,
  link: `/tickets?open=${t.id}`,
  createdAt: t.createdAt,
  completed: t.status === 'CLOSED',
  overdue: t.isOverdue,
});

// Same real numbers AnalyticsSummaryStrip's KPI tiles already show, just surfaced as a compact
// pair of gauges in the overview's right rail instead of only living in a text-based stat tile.
export const ComplianceGaugeRail = ({ groupBy, from, to }: ComplianceGaugeRailProps) => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { data: taskRows, isPending: taskPending, isError: taskError } = useTaskComplianceReportQuery(groupBy, from, to);
  const { data: ticketRows, isPending: ticketPending, isError: ticketError } = useTicketTatReportQuery(groupBy, from, to);
  const isPending = taskPending || ticketPending;
  const isError = taskError || ticketError;

  const checklistCompletion = latestWithTrend(taskRows, 'completionRate', 'rate').value;
  const latestTicket = ticketRows?.[ticketRows.length - 1];
  const slaMet = slaMetRate(latestTicket);

  // On-time is a literal closed-tickets population (same definition AnalyticsSummaryStrip's own
  // "On-time completion" card already drills into) — real rows, fetched only once this ring is
  // actually tapped, same on-demand pattern that card uses.
  const [onTimeOpen, setOnTimeOpen] = useState(false);
  const { data: onTimePage, isPending: onTimePending } = useQuery({
    queryKey: ['analytics', 'gauge-on-time-drilldown', from, to],
    queryFn: () => ticketApi.getAll(1, DRILLDOWN_FETCH_LIMIT, 'CLOSED', undefined, false, from, to, 'closedAt'),
    enabled: !!token && onTimeOpen,
    retry: handleQueryRetry,
  });
  const onTimeRows = onTimePage?.data.map(ticketRow) ?? [];
  const onTimeTotal = onTimePage?.meta?.total ?? onTimeRows.length;

  return (
    <div className="rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <EntityIconTile icon={GaugeIcon} tone="primary" className="size-8 rounded-lg" />
        <h3 className="text-sm font-display font-bold tracking-wide text-text">Compliance</h3>
      </div>
      {isError ? (
        // A failed request used to fall through to the same '—' center label as "not enough
        // data yet" — indistinguishable from a genuine zero/empty reading. This is the one
        // real signal on the page that the request itself failed, not just came back empty.
        <div className="flex items-start gap-3 p-3 bg-danger/10 border border-danger/30 rounded-xl">
          <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
          <p className="text-xs font-display font-medium text-danger">Couldn&rsquo;t load compliance data. Try refreshing.</p>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-4">
          {/* Skeleton rings while loading, not a real gauge stuck at 0% — a genuine 0% reading and
              "still fetching" used to look identical (an empty arc), the difference only visible in
              the center label ('—' vs '0%'). */}
          {isPending ? (
            <>
              <GaugeSkeleton />
              <GaugeSkeleton />
            </>
          ) : (
            <>
              <Gauge
                icon={ClipboardCheck}
                label="Checklist"
                percent={checklistCompletion}
                gradientFrom="var(--color-primary-700)"
                gradientTo="var(--color-primary-400)"
                // Bucketed rate across every delegation's checklist items, not a literal record
                // list — /tasks/team is the real records it's computed from (see
                // TaskChecklistKpiSection's identical call for the same metric).
                onClick={() => navigate('/tasks/team')}
              />
              <Gauge
                icon={ShieldCheck}
                label="On-time"
                percent={slaMet}
                gradientFrom="var(--color-coral-600)"
                gradientTo="var(--color-coral-400)"
                onClick={() => setOnTimeOpen(true)}
              />
            </>
          )}
        </div>
      )}

      {onTimeOpen && (
        <DrilldownModal
          open
          onClose={() => setOnTimeOpen(false)}
          title="On-time tickets"
          icon={ShieldCheck}
          rows={onTimeRows}
          isLoading={onTimePending}
          cappedNote={!onTimePending && onTimeTotal > onTimeRows.length ? `Showing the newest ${onTimeRows.length} of ${onTimeTotal}` : undefined}
          viewAllHref="/admin/tickets"
          viewAllLabel="View all tickets"
        />
      )}
    </div>
  );
};
