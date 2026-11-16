import { useQuery } from '@tanstack/react-query';
import { dashboardApi, type MyApprovals } from '../../api/dashboard';
import { useAuth } from '../../context/AuthContext';
import { handleQueryRetry } from '../../lib/queryHelpers';
import { DASHBOARD_QUERY_OPTIONS } from '../../lib/dashboardQuery';
import type { ApprovalBucket } from '../pc/usePcApprovalBuckets';

export type ApprovalKind = 'delegation' | 'tickets' | 'checklist';

export type ApprovalKinds = Record<ApprovalKind, ApprovalBucket>;

export interface ApprovalFigure {
  value: number;
  kinds?: ApprovalKinds;
  caption: string;
  delayed: number;
  href?: string;
  loading: boolean;
  failed: boolean;
}

const sumOf = (data: MyApprovals | undefined, key: 'waiting' | 'delayed') =>
  data ? data.tickets[key] + data.delegations[key] + data.checklists[key] : 0;

export const useOwnApprovalFigure = (): ApprovalFigure => {
  const { token } = useAuth();
  const query = useQuery({
    queryKey: ['dashboard', 'my-approvals'] as const,
    queryFn: () => dashboardApi.myApprovals(),
    enabled: !!token,
    retry: handleQueryRetry,
    ...DASHBOARD_QUERY_OPTIONS,
    staleTime: 30_000,
  });
  const value = sumOf(query.data, 'waiting');
  const delayed = sumOf(query.data, 'delayed');
  return {
    value,
    delayed,
    caption: delayed > 0 ? `${delayed} waiting over 24 hours` : 'Your work waiting for approval',
    loading: query.isPending,
    failed: query.isError && !query.data,
  };
};

export const teamApprovalFigure = (bucket: ApprovalBucket, queueHref: string, loading: boolean, failed: boolean, kinds?: ApprovalKinds): ApprovalFigure => ({
  value: bucket.pending,
  kinds,
  delayed: bucket.old,
  caption: bucket.old > 0 ? `${bucket.old} waiting over 24 hours` : 'Waiting for your decision',
  href: queueHref,
  loading,
  failed,
});
