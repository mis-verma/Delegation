import { ClipboardCheck, Camera } from 'lucide-react';
import { KpiSectionShell } from './KpiSectionShell';
import { useTaskComplianceReportQuery } from './useAnalyticsQueries';
import { latestWithTrend, formatPercent } from './analyticsDisplay';
import type { GroupBy } from './GroupByControl';

interface TaskChecklistKpiSectionProps {
  groupBy: GroupBy;
  from?: string;
  to?: string;
  /** /tasks/team (the org-wide destination) is PC/ADMIN-gated. */
  isOrgWideRole: boolean;
}

const NOTHING_COUNTED = 'Nothing counted in this period';

export const TaskChecklistKpiSection = ({ groupBy, from, to, isOrgWideRole }: TaskChecklistKpiSectionProps) => {
  const { data: rows, isPending, isError, isFetching, refetch } = useTaskComplianceReportQuery(groupBy, from, to);
  const completion = latestWithTrend(rows, 'completionRate', 'rate');
  const quality = latestWithTrend(rows, 'qualityRate', 'rate');
  // Both figures are rates over the checklist items inside delegations, so there is no single
  // record list to open. The delegation list they come from is the honest destination: the team
  // view for ADMIN/PC, the viewer's own reach for everyone else.
  const href = isOrgWideRole ? '/tasks/team' : '/tasks';

  return (
    <KpiSectionShell
      icon={ClipboardCheck}
      title="Delegations"
      description="How many checklist items inside delegations are done, and how many of the ones that need a photo have one."
      isPending={isPending}
      isError={isError}
      isFetching={isFetching}
      errorMessage="Could not load the delegation figures."
      onRetry={() => void refetch()}
      from={from}
      to={to}
      cards={[
        {
          icon: ClipboardCheck,
          iconTint: 'text-primary-600 dark:text-primary-400',
          label: 'Delegation checklist items',
          value: formatPercent(completion.value),
          hasData: completion.value != null,
          noDataText: NOTHING_COUNTED,
          trend: completion.trend,
          href,
        },
        {
          icon: Camera,
          iconTint: 'text-success',
          label: 'Photo quality',
          value: formatPercent(quality.value),
          hasData: quality.value != null,
          noDataText: 'No items need a photo yet',
          trend: quality.trend,
          href,
        },
      ]}
      chart={{
        data: rows ?? [],
        groupBy,
        series: [
          { key: 'completionRate', label: 'Items done', color: 'var(--color-primary-500)' },
          { key: 'qualityRate', label: 'Photo quality', color: 'var(--color-success)' },
        ],
        valueSuffix: '%',
        yDomain: [0, 100],
      }}
    />
  );
};
