import type { LucideIcon } from 'lucide-react';
import { ClipboardCheck, ShieldCheck } from 'lucide-react';
import { RadialGauge, Skeleton } from '../../../components';
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
}

const Gauge = ({ icon: Icon, label, percent }: GaugeProps) => (
  <div className="flex flex-col items-center gap-2 flex-1">
    <RadialGauge percent={percent ?? 0} size={128}>
      <span className="text-xl font-display font-bold text-text tracking-tight">
        {percent != null ? `${percent}%` : '—'}
      </span>
    </RadialGauge>
    <span className="flex items-center gap-1.5 text-xs font-display font-medium text-text-muted">
      <Icon size={13} />
      {label}
    </span>
  </div>
);

const GaugeSkeleton = () => (
  <div className="flex flex-col items-center gap-2 flex-1">
    <Skeleton className="rounded-full" style={{ width: 128, height: 128 }} />
    <Skeleton className="h-3 w-16 rounded" />
  </div>
);

// Same real numbers AnalyticsSummaryStrip's KPI tiles already show, just surfaced as a compact
// pair of gauges in the overview's right rail instead of only living in a text-based stat tile.
export const ComplianceGaugeRail = ({ groupBy, from, to }: ComplianceGaugeRailProps) => {
  const { data: taskRows, isPending: taskPending } = useTaskComplianceReportQuery(groupBy, from, to);
  const { data: ticketRows, isPending: ticketPending } = useTicketTatReportQuery(groupBy, from, to);
  const isPending = taskPending || ticketPending;

  const checklistCompletion = latestWithTrend(taskRows, 'completionRate', 'rate').value;
  const latestTicket = ticketRows?.[ticketRows.length - 1];
  const slaMet = slaMetRate(latestTicket);

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h3 className="text-sm font-display font-bold tracking-wide text-text mb-4">Compliance</h3>
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
            <Gauge icon={ClipboardCheck} label="Checklist" percent={checklistCompletion} />
            <Gauge icon={ShieldCheck} label="On-time" percent={slaMet} />
          </>
        )}
      </div>
    </div>
  );
};
