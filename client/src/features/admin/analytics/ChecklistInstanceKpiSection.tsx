import { Repeat, Camera, ShieldCheck, AlertTriangle, ListChecks, CheckCheck } from 'lucide-react';
import { KpiSectionShell } from './KpiSectionShell';
import { useChecklistInstanceComplianceReportQuery } from './useAnalyticsQueries';
import { latestWithTrend, formatPercent } from './analyticsDisplay';
import type { GroupBy } from './GroupByControl';

interface ChecklistInstanceKpiSectionProps {
  groupBy: GroupBy;
  from?: string;
  to?: string;
  /** /admin/checklist-compliance (the org-wide destination) is PC/ADMIN-gated. */
  isOrgWideRole: boolean;
  /** Off by default (server-side too) so a deleted checklist's historical runs stay out of these
   *  rates. Passed down from the Compliance Board's own "Show deleted checklists" toggle when this
   *  section is embedded there. */
  includeDeleted?: boolean;
  /** False on the Checklist Compliance page itself: the cards would only link back to where the viewer already is. */
  linkCards?: boolean;
  /** Narrow every figure and the trend to one store and/or one person. */
  storeId?: string;
  assigneeId?: string;
  /** Names of the active store/person filters, shown as the heading so the numbers say whose they are. */
  scopeLabel?: string;
}

const NOTHING_COUNTED = 'Nothing counted in this period';

export const ChecklistInstanceKpiSection = ({ groupBy, from, to, isOrgWideRole, includeDeleted, storeId, assigneeId, scopeLabel, linkCards = true }: ChecklistInstanceKpiSectionProps) => {
  // A picked range is one whole-range figure (the same as the headline strip above), so the cards
  // read a 'none' report; the chart still reads the grouped series so it has points to draw.
  const hasRange = Boolean(from || to);
  const chartQuery = useChecklistInstanceComplianceReportQuery(groupBy, from, to, { includeDeleted, storeId, assigneeId });
  const cardQuery = useChecklistInstanceComplianceReportQuery(hasRange ? 'none' : groupBy, from, to, { includeDeleted, storeId, assigneeId });
  const { data: rows } = cardQuery;
  const isPending = cardQuery.isPending || chartQuery.isPending;
  const isError = cardQuery.isError || chartQuery.isError;
  const isFetching = cardQuery.isFetching || chartQuery.isFetching;
  const refetch = () => Promise.all([cardQuery.refetch(), chartQuery.refetch()]);
  const completion = latestWithTrend(rows, 'completionRate', 'rate');
  const compliance = latestWithTrend(rows, 'complianceRate', 'rate');
  const quality = latestWithTrend(rows, 'qualityRate', 'rate');
  const approval = latestWithTrend(rows, 'approvalRate', 'rate');
  const issues = latestWithTrend(rows, 'issueRate', 'rate');
  const dueRuns = latestWithTrend(rows, 'dueRuns', 'count');

  // Every figure is a rate across all runs in the period, not a list of records. The per-run rows
  // live on the compliance board (ADMIN/PC) or the history page (managers and senior staff).
  const href = !linkCards ? undefined : isOrgWideRole ? '/admin/checklist-compliance' : '/checklists/history';

  return (
    <KpiSectionShell
      icon={Repeat}
      title={scopeLabel || 'Store checklists'}
      description={scopeLabel
        ? "Only checklists assigned to this selection. A shared checklist counts for everyone it is assigned to. Completion leaves out runs that are not due yet."
        : "How much of each period's checklist work was finished on time, answered inside the accepted range, backed by photos and approved the first time. Completion leaves out runs that are not due yet."}
      isPending={isPending}
      isError={isError}
      isFetching={isFetching}
      errorMessage="Could not load the store checklist figures."
      error={cardQuery.error ?? chartQuery.error}
      onRetry={() => void refetch()}
      from={from}
      to={to}
      summaryRows={rows}
      cards={[
        {
          icon: Repeat,
          iconTint: 'text-primary-600 dark:text-primary-400',
          label: 'Completion',
          value: formatPercent(completion.value),
          hasData: completion.value != null,
          noDataText: NOTHING_COUNTED,
          trend: completion.trend,
          href,
        },
        {
          icon: CheckCheck,
          iconTint: 'text-primary-600 dark:text-primary-400',
          // Answers that landed inside their accepted-answer rule, out of the answers that have one.
          label: 'Answer compliance',
          value: formatPercent(compliance.value),
          hasData: compliance.value != null,
          noDataText: 'No answers with a rule yet',
          trend: compliance.trend,
          href,
        },
        {
          icon: Camera,
          iconTint: 'text-success',
          label: 'Photo quality',
          value: formatPercent(quality.value),
          hasData: quality.value != null,
          noDataText: NOTHING_COUNTED,
          trend: quality.trend,
          href,
        },
        {
          icon: ShieldCheck,
          iconTint: 'text-coral-600 dark:text-coral-400',
          // A run the reviewer ever sent back stops counting here, even once it is fixed and approved.
          label: 'Approved first time',
          value: formatPercent(approval.value),
          hasData: approval.value != null,
          noDataText: 'Nothing submitted yet',
          trend: approval.trend,
          href,
        },
        {
          icon: AlertTriangle,
          iconTint: 'text-danger',
          // Share of Yes/No answers that landed on the flagged branch. Rising is bad news.
          label: 'Flagged answers',
          value: formatPercent(issues.value),
          hasData: issues.value != null,
          noDataText: NOTHING_COUNTED,
          trend: issues.trend,
          lowerIsBetter: true,
          href,
        },
        {
          icon: ListChecks,
          iconTint: 'text-primary-600 dark:text-primary-400',
          label: 'Runs counted',
          value: dueRuns.value ?? 0,
          hasData: dueRuns.value != null,
          noDataText: NOTHING_COUNTED,
          trend: dueRuns.trend,
          caption: 'Runs due or finished',
          href,
        },
      ]}
      chart={{
        data: chartQuery.data ?? [],
        groupBy,
        series: [
          { key: 'completionRate', label: 'Completion', color: 'var(--color-primary-500)' },
          { key: 'complianceRate', label: 'Answer compliance', color: 'var(--color-warning)' },
          { key: 'qualityRate', label: 'Photo quality', color: 'var(--color-success)' },
          { key: 'approvalRate', label: 'Approved first time', color: 'var(--color-coral-500)' },
        ],
        valueSuffix: '%',
        yDomain: [0, 100],
      }}
    />
  );
};
