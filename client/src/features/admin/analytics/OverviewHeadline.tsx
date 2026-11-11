import { memo, useMemo } from 'react';
import { AlertTriangle, ClipboardCheck, Clock3, ShieldQuestion } from 'lucide-react';
import { StatStrip, type StatStripItem } from '../../dashboard/StatStrip';
import { useDashboardSummaries } from '../../dashboard/useDashboardSummaries';
import { usePcApprovalBuckets } from '../../pc/usePcApprovalBuckets';

export const OverviewHeadline = memo(() => {
  const { kpi } = useDashboardSummaries();
  const { total: approvals, approvals: approvalSources } = usePcApprovalBuckets();

  const items = useMemo<StatStripItem[]>(() => {
    const tasks = kpi.tasks.data;
    const tickets = kpi.tickets.data;
    const org = kpi.orgChecklistToday.data;
    const workLoading = (kpi.tasks.isPending && !tasks) || (kpi.tickets.isPending && !tickets);
    const workFailed = (!tasks && kpi.tasks.isError) || (!tickets && kpi.tickets.isError);
    const lateRuns = org?.missed ?? 0;
    const late = (tasks?.overdue ?? 0) + (tickets?.overdue ?? 0) + lateRuns;
    const pending = (tasks?.pending ?? 0) + (tickets?.pending ?? 0);
    const fill = org?.completionPct ?? null;
    return [
      {
        key: 'checklists',
        label: 'Checklists done today',
        value: fill === null ? '-' : `${Math.round(fill)}%`,
        caption: org ? `${org.completed} of ${org.total} runs` : 'Every store',
        icon: ClipboardCheck,
        tint: 'primary',
        href: '/checklists/team?status=completed',
        highlight: true,
        loading: kpi.orgChecklistToday.isPending && !org,
        failed: !org && kpi.orgChecklistToday.isError,
      },
      {
        key: 'approvals',
        label: 'Waiting for approval',
        value: approvals.pending,
        caption: approvals.old > 0 ? `${approvals.old} over 24 hours` : 'None delayed',
        icon: ShieldQuestion,
        tint: approvals.old > 0 ? 'danger' : 'coral',
        href: '/?tab=approvals',
        loading: approvalSources.isPending,
        failed: approvalSources.hasError,
      },
      {
        key: 'late',
        label: 'Late work',
        value: late,
        caption: 'Tickets, delegations, checklists',
        icon: AlertTriangle,
        tint: late > 0 ? 'danger' : 'success',
        href: '/?tab=attention',
        loading: workLoading,
        failed: workFailed,
      },
      {
        key: 'pending',
        label: 'Open work',
        value: pending,
        caption: 'Tickets and delegations',
        icon: Clock3,
        tint: 'primary',
        href: '/tasks?quickFilter=pending',
        loading: workLoading,
        failed: workFailed,
      },
    ];
  }, [kpi, approvals, approvalSources.isPending, approvalSources.hasError]);

  return <StatStrip items={items} label="Organisation headline numbers" />;
});
OverviewHeadline.displayName = 'OverviewHeadline';
