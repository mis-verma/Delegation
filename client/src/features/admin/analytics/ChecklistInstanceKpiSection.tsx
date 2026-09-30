import { Repeat, Camera, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router';
import { KpiSectionShell } from './KpiSectionShell';
import { ReportTrendChart } from './ReportTrendChart';
import { useChecklistInstanceComplianceReportQuery } from './useAnalyticsQueries';
import { latestWithTrend } from './analyticsDisplay';
import type { GroupBy } from './GroupByControl';

interface ChecklistInstanceKpiSectionProps {
  groupBy: GroupBy;
  from?: string;
  to?: string;
  /** /admin/checklist-compliance (this card's click destination) is PC/ADMIN-gated. */
  isOrgWideRole: boolean;
  /** Off by default (server-side too) — include a deleted checklist's historical instances in
   *  these rates/trend instead of hiding them. Passed down from the Compliance Board's own
   *  "Show deleted checklists" toggle when this section is embedded there. */
  includeDeleted?: boolean;
}

export const ChecklistInstanceKpiSection = ({ groupBy, from, to, isOrgWideRole, includeDeleted }: ChecklistInstanceKpiSectionProps) => {
  const navigate = useNavigate();
  const { data: rows, isPending, isError } = useChecklistInstanceComplianceReportQuery(groupBy, from, to, includeDeleted);
  const completion = latestWithTrend(rows, 'completionRate', 'rate');
  const quality = latestWithTrend(rows, 'qualityRate', 'rate');
  const approval = latestWithTrend(rows, 'approvalRate', 'rate');
  const issues = latestWithTrend(rows, 'issueRate', 'rate');
  // All three are rates bucketed across every instance, not a literal record list — the real
  // per-instance rows these are computed from live on the Checklist Compliance board, the same
  // destination AnalyticsSummaryStrip's own "Proof compliance" card already points at.
  const onClick = isOrgWideRole ? () => navigate('/admin/checklist-compliance') : undefined;

  return (
    <KpiSectionShell
      icon={Repeat}
      title="Recurring Checklists"
      description="Completion, photo-evidence compliance, PC first-attempt approval, and flagged Yes/No answers for scheduled checklist instances, bucketed by each instance's period."
      isPending={isPending}
      isError={isError}
      errorMessage="Failed to load recurring checklist data."
      from={from}
      to={to}
      cards={[
        {
          icon: Repeat,
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
        {
          icon: ShieldCheck,
          iconTint: 'text-coral-600 dark:text-coral-400',
          // "First attempt" — an instance the PC ever rejected no longer counts here, even once
          // it's later fixed and approved (see checklistInstance.service.ts#complianceReport).
          label: 'PC approval rate (first attempt)',
          value: approval.value != null ? `${approval.value}%` : '—',
          trend: approval.trend,
          onClick,
        },
        {
          icon: AlertTriangle,
          iconTint: 'text-danger',
          // Share of gated Yes/No-style answers (one branch wired with a conditional action) that
          // landed on the flagged branch — rising is bad news, same treatment as Overdue.
          label: 'Flagged answers',
          value: issues.value != null ? `${issues.value}%` : '—',
          trend: issues.trend,
          lowerIsBetter: true,
          onClick,
        },
      ]}
      chart={
        <ReportTrendChart
          data={rows ?? []}
          series={[
            { key: 'completionRate', label: 'Completion %', color: 'var(--color-primary-500)' },
            { key: 'qualityRate', label: 'Quality %', color: 'var(--color-success)' },
            { key: 'approvalRate', label: 'PC approval %', color: 'var(--color-coral-500)' },
            { key: 'issueRate', label: 'Flagged %', color: 'var(--color-danger)' },
          ]}
          valueSuffix="%"
          yDomain={[0, 100]}
        />
      }
    />
  );
};
