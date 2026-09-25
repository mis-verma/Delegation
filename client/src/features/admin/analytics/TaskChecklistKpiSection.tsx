import { ClipboardCheck, Camera } from 'lucide-react';
import { useNavigate } from 'react-router';
import { KpiSectionShell } from './KpiSectionShell';
import { ReportTrendChart } from './ReportTrendChart';
import { useTaskComplianceReportQuery } from './useAnalyticsQueries';
import { latestWithTrend } from './analyticsDisplay';
import type { GroupBy } from './GroupByControl';

interface TaskChecklistKpiSectionProps {
  groupBy: GroupBy;
  from?: string;
  to?: string;
  /** /tasks/team (this card's click destination) is PC/ADMIN-gated — see the onClick comment
   *  below for why a plain navigate is the right destination here at all. */
  isOrgWideRole: boolean;
}

export const TaskChecklistKpiSection = ({ groupBy, from, to, isOrgWideRole }: TaskChecklistKpiSectionProps) => {
  const navigate = useNavigate();
  const { data: rows, isPending, isError } = useTaskComplianceReportQuery(groupBy, from, to);
  const completion = latestWithTrend(rows, 'completionRate', 'rate');
  const quality = latestWithTrend(rows, 'qualityRate', 'rate');
  // Both cards are rates averaged across every delegation's own checklist items — no literal
  // per-item record list exists to open in a DrilldownModal without fabricating one (same call
  // AnalyticsSummaryStrip's own "Checklist completion"/"Proof compliance" cards already made).
  // /tasks/team is the real record list these rates are computed from, so that's the honest
  // destination — gated to ADMIN/PC since that's the only role that can reach it.
  const onClick = isOrgWideRole ? () => navigate('/tasks/team') : undefined;

  return (
    <KpiSectionShell
      icon={ClipboardCheck}
      title="Delegation Checklists"
      description="Checklist-item completion and photo-quality compliance across every delegation."
      isPending={isPending}
      isError={isError}
      errorMessage="Failed to load delegation checklist data."
      from={from}
      to={to}
      cards={[
        {
          icon: ClipboardCheck,
          iconTint: 'text-primary-600 dark:text-primary-400',
          label: 'Completion rate',
          value: completion.value != null ? `${completion.value}%` : '—',
          trend: completion.trend,
          onClick,
        },
        {
          icon: Camera,
          iconTint: 'text-success',
          label: 'Photo quality rate',
          value: quality.value != null ? `${quality.value}%` : '—',
          trend: quality.trend,
          onClick,
        },
      ]}
      chart={
        <ReportTrendChart
          data={rows ?? []}
          series={[
            { key: 'completionRate', label: 'Completion %', color: 'var(--color-primary-500)' },
            { key: 'qualityRate', label: 'Quality %', color: 'var(--color-success)' },
          ]}
          valueSuffix="%"
          yDomain={[0, 100]}
        />
      }
    />
  );
};
