import { Repeat, Camera, ShieldCheck, AlertTriangle, ListChecks, CheckCheck } from 'lucide-react';
import { KpiSectionShell, type KpiCardConfig } from './KpiSectionShell';
import { useChecklistInstanceComplianceReportQuery } from './useAnalyticsQueries';
import { latestWithTrend, formatPercent, NO_TREND } from './analyticsDisplay';
import { useOverviewScores } from './useOverviewScores';
import { MODULE_LABEL, SCORE_LABEL, complianceLabel } from '../../../lib/scoreLabels';
import type { GroupBy } from './GroupByControl';

interface ChecklistInstanceKpiSectionProps {
  groupBy: GroupBy;
  from?: string;
  to?: string;
  isOrgWideRole: boolean;
  includeDeleted?: boolean;
  linkCards?: boolean;
  storeId?: string;
  assigneeId?: string;
  scopeLabel?: string;
  windowFrom?: string;
  windowTo?: string;
}

const NOTHING_COUNTED = 'Nothing counted in this period';

export const ChecklistInstanceKpiSection = ({ groupBy, from, to, isOrgWideRole, includeDeleted, storeId, assigneeId, scopeLabel, windowFrom, windowTo, linkCards = true }: ChecklistInstanceKpiSectionProps) => {
  const hasRange = Boolean(from || to);
  const chartQuery = useChecklistInstanceComplianceReportQuery(groupBy, from, to, { includeDeleted, storeId, assigneeId });
  const cardQuery = useChecklistInstanceComplianceReportQuery(hasRange ? 'none' : groupBy, from, to, { includeDeleted, storeId, assigneeId });
  const { data: rows } = cardQuery;
  const fromExplorer = !!windowFrom && !!windowTo && !assigneeId && !includeDeleted;
  const scores = useOverviewScores(windowFrom, windowTo, { storeId, enabled: fromExplorer });
  const checklist = fromExplorer ? scores.total?.checklist : undefined;
  const scoresLoading = fromExplorer && scores.isPending && !scores.data;
  const scoresFailed = fromExplorer && scores.isError && !scores.data;
  const isPending = cardQuery.isPending || chartQuery.isPending || scoresLoading;
  const isError = cardQuery.isError || chartQuery.isError || scoresFailed;
  const refetch = () => Promise.all([cardQuery.refetch(), chartQuery.refetch(), ...(scoresFailed ? [scores.refetch()] : [])]);
  const completion = latestWithTrend(rows, 'completionRate', 'rate');
  const compliance = latestWithTrend(rows, 'complianceRate', 'rate');
  const quality = latestWithTrend(rows, 'qualityRate', 'rate');
  const approval = latestWithTrend(rows, 'approvalRate', 'rate');
  const issues = latestWithTrend(rows, 'issueRate', 'rate');
  const dueRuns = latestWithTrend(rows, 'dueRuns', 'count');

  const href = !linkCards ? undefined : isOrgWideRole ? '/team/fill/compliance' : '/checklists/history';

  const itemsDoneCard = {
    icon: Repeat,
    iconTint: 'text-primary-600 dark:text-primary-400',
    label: 'Items done',
    caption: 'Counts questions, not whole checklists',
    how: { figure: 'itemsDone' as const },
    value: formatPercent(completion.value),
    raw: completion.value,
    unit: '%' as const,
    hasData: completion.value != null,
    noDataText: NOTHING_COUNTED,
    trend: completion.trend,
    href,
  };
  const answersRightCard = {
    icon: CheckCheck,
    iconTint: 'text-primary-600 dark:text-primary-400',
    label: complianceLabel('checklist'),
    how: { figure: 'compliance' as const, module: 'checklist' as const },
    ...(checklist
      ? { value: formatPercent(checklist.compliance), raw: checklist.compliance, hasData: checklist.compliance != null, trend: NO_TREND, caption: scores.win?.label }
      : { value: formatPercent(compliance.value), raw: compliance.value, hasData: compliance.value != null, trend: compliance.trend, caption: undefined }),
    unit: '%' as const,
    noDataText: 'No answers with a rule yet',
    href,
  };
  const photoCard = {
    icon: Camera,
    iconTint: 'text-success',
    label: 'Photo quality',
    value: formatPercent(quality.value),
    raw: quality.value,
    unit: '%' as const,
    hasData: quality.value != null,
    noDataText: NOTHING_COUNTED,
    trend: quality.trend,
    href,
  };
  const approvedCard = {
    icon: ShieldCheck,
    iconTint: 'text-coral-600 dark:text-coral-400',
    label: 'Approved first time',
    value: formatPercent(approval.value),
    raw: approval.value,
    unit: '%' as const,
    hasData: approval.value != null,
    noDataText: 'Nothing submitted yet',
    trend: approval.trend,
    href,
  };
  const flaggedCard = {
    icon: AlertTriangle,
    iconTint: 'text-danger',
    label: 'Flagged answers',
    value: formatPercent(issues.value),
    raw: issues.value,
    unit: '%' as const,
    hasData: issues.value != null,
    noDataText: NOTHING_COUNTED,
    trend: issues.trend,
    lowerIsBetter: true,
    href,
  };
  const runsCard = {
    icon: ListChecks,
    iconTint: 'text-primary-600 dark:text-primary-400',
    label: 'Runs counted',
    value: dueRuns.value ?? 0,
    hasData: dueRuns.value != null,
    noDataText: NOTHING_COUNTED,
    trend: dueRuns.trend,
    caption: 'Runs due or finished',
    href,
  };
  const completionCard = {
    icon: ListChecks,
    iconTint: 'text-primary-600 dark:text-primary-400',
    label: `${MODULE_LABEL.checklist} ${SCORE_LABEL.completion.toLowerCase()}`,
    how: { figure: 'completion' as const, module: 'checklist' as const },
    value: formatPercent(checklist?.completion),
    raw: checklist?.completion ?? null,
    unit: '%' as const,
    hasData: !!checklist && checklist.due > 0 && checklist.completion != null,
    noDataText: 'No checklists were due',
    trend: NO_TREND,
    caption: checklist ? `${checklist.done} of ${checklist.due} runs done` : undefined,
    href,
  };
  const cards: KpiCardConfig[] = fromExplorer
    ? [completionCard, itemsDoneCard, answersRightCard, photoCard, approvedCard, flaggedCard]
    : [itemsDoneCard, answersRightCard, photoCard, approvedCard, flaggedCard, runsCard];

  return (
    <KpiSectionShell
      icon={Repeat}
      title={scopeLabel || 'Store checklists'}
      description={scopeLabel
        ? "Only checklists assigned to this selection. A shared checklist counts for everyone it is assigned to. Items done counts questions on runs that are due, not whole checklists."
        : "How much of each period's checklist work was finished on time, answered inside the accepted range, backed by photos and approved the first time. Items done counts questions on runs that are due, not whole checklists."}
      isPending={isPending}
      isError={isError}
      errorMessage="Could not load the store checklist figures."
      error={cardQuery.error ?? chartQuery.error ?? scores.error}
      updating={fromExplorer && scores.updating}
      onRetry={() => void refetch()}
      from={from}
      to={to}
      summaryRows={rows}
      cards={cards}
      chart={{
        data: chartQuery.data ?? [],
        groupBy,
        series: [
          { key: 'completionRate', label: 'Items done', color: 'var(--color-primary-500)' },
          { key: 'complianceRate', label: complianceLabel('checklist'), color: 'var(--color-warning)' },
          { key: 'qualityRate', label: 'Photo quality', color: 'var(--color-success)' },
          { key: 'approvalRate', label: 'Approved first time', color: 'var(--color-coral-500)' },
        ],
        valueSuffix: '%',
        yDomain: [0, 100],
      }}
    />
  );
};
