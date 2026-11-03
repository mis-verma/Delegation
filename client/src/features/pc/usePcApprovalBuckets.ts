import { useApprovalSources } from '../dashboard/useApprovalSources';

export interface ApprovalBucket {
  pending: number;
  old: number;
  fresh: number;
}

const bucketOf = (data: { total: number; over24h: number } | undefined): ApprovalBucket => {
  const pending = data?.total ?? 0;
  const old = Math.min(data?.over24h ?? 0, pending);
  return { pending, old, fresh: pending - old };
};

export const usePcApprovalBuckets = () => {
  const approvals = useApprovalSources();
  const ticket = bucketOf(approvals.tickets.data);
  const delegation = bucketOf(approvals.tasks.data);
  const checklist = bucketOf(approvals.checklists.data);
  const total: ApprovalBucket = {
    pending: ticket.pending + delegation.pending + checklist.pending,
    old: ticket.old + delegation.old + checklist.old,
    fresh: ticket.fresh + delegation.fresh + checklist.fresh,
  };
  return { approvals, ticket, delegation, checklist, total };
};
