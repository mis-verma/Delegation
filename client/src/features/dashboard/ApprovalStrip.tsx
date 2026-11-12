import { memo, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlarmClock, CheckCheck, Hourglass, ShieldCheck } from 'lucide-react';
import { dashboardApi, type MyApprovals } from '../../api/dashboard';
import { useAuth } from '../../context/AuthContext';
import { handleQueryRetry } from '../../lib/queryHelpers';
import { DASHBOARD_QUERY_OPTIONS } from '../../lib/dashboardQuery';
import { usePcApprovalBuckets } from '../pc/usePcApprovalBuckets';
import { StatStrip, type StatStripItem } from './StatStrip';

const sumOf = (data: MyApprovals | undefined, key: 'waiting' | 'delayed' | 'approvedToday') =>
  data ? data.tickets[key] + data.delegations[key] + data.checklists[key] : 0;

export const OwnApprovalStrip = memo(() => {
  const { token } = useAuth();
  const query = useQuery({
    queryKey: ['dashboard', 'my-approvals'] as const,
    queryFn: () => dashboardApi.myApprovals(),
    enabled: !!token,
    retry: handleQueryRetry,
    ...DASHBOARD_QUERY_OPTIONS,
    staleTime: 30_000,
  });
  const loading = query.isPending;
  const failed = query.isError && !query.data;

  const items = useMemo<StatStripItem[]>(() => {
    const waiting = sumOf(query.data, 'waiting');
    const delayed = sumOf(query.data, 'delayed');
    return [
      { key: 'waiting', label: 'Waiting approval', value: waiting, caption: 'Your work sent for approval', icon: Hourglass, tint: 'primary', loading, failed },
      { key: 'delayed', label: 'Approval delayed', value: delayed, caption: 'Waiting more than 24 hours', icon: AlarmClock, tint: delayed > 0 ? 'danger' : 'success', loading, failed },
      { key: 'approved', label: 'Approved today', value: sumOf(query.data, 'approvedToday'), caption: 'Your work approved today', icon: CheckCheck, tint: 'success', loading, failed },
    ];
  }, [query.data, loading, failed]);

  return <StatStrip items={items} label="Approvals of my own work" />;
});
OwnApprovalStrip.displayName = 'OwnApprovalStrip';

export const TeamApprovalStrip = memo(({ queueHref }: { queueHref: string }) => {
  const { approvals, total } = usePcApprovalBuckets();
  const sources = [approvals.tickets, approvals.tasks, approvals.checklists];
  const loading = sources.every((s) => s.isPending);
  const failed = sources.every((s) => s.isError && !s.data);

  const items: StatStripItem[] = [
    { key: 'to-approve', label: 'To approve', value: total.pending, caption: 'Waiting for your decision', icon: ShieldCheck, tint: 'primary', href: queueHref, loading, failed },
    { key: 'over-24h', label: 'Approval delayed', value: total.old, caption: 'Waiting more than 24 hours', icon: AlarmClock, tint: total.old > 0 ? 'danger' : 'success', href: queueHref, loading, failed },
    { key: 'fresh', label: 'Within 24 hours', value: total.fresh, caption: 'Still on time to decide', icon: Hourglass, tint: 'success', href: queueHref, loading, failed },
  ];

  return <StatStrip items={items} label="Approvals waiting for me" />;
});
TeamApprovalStrip.displayName = 'TeamApprovalStrip';
