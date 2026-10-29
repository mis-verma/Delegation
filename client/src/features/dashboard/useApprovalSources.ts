import { useAuth } from '../../context/AuthContext';
import { useTaskPendingApprovalQuery } from '../tasks/hook';
import { useTicketPendingApprovalQuery } from '../tickets/hook';
import { useChecklistPendingApprovalQuery } from '../checklist/hook';
import { DASHBOARD_QUERY_OPTIONS } from '../../lib/dashboardQuery';

export const useApprovalSources = () => {
  const { user } = useAuth();
  const role = user?.role;
  const reviewsAllWork = role === 'ADMIN' || role === 'PC';
  const isHod = role === 'MANAGER' || role === 'SENIOR';
  const asksChecklists = !!role;

  const reviewsWork = reviewsAllWork || isHod;
  const tasks = useTaskPendingApprovalQuery(reviewsWork, DASHBOARD_QUERY_OPTIONS);
  const tickets = useTicketPendingApprovalQuery(reviewsWork, DASHBOARD_QUERY_OPTIONS);
  const checklists = useChecklistPendingApprovalQuery(asksChecklists, DASHBOARD_QUERY_OPTIONS);

  const reportsErrors = reviewsAllWork || isHod;

  const isPending = (reviewsWork && (tasks.isPending || tickets.isPending)) || (asksChecklists && checklists.isPending);
  const failedWithoutData = (q: { isError: boolean; data: unknown }) => q.isError && q.data === undefined;
  const hasError = reportsErrors && ((reviewsWork && (failedWithoutData(tasks) || failedWithoutData(tickets))) || failedWithoutData(checklists));

  const total =
    (reviewsWork ? (tasks.data?.total ?? 0) + (tickets.data?.total ?? 0) : 0) +
    (checklists.data?.total ?? 0);

  return {
    reviewsAllWork,
    isHod,
    reportsErrors,
    queueHref: reviewsAllWork ? '/verify' : isHod ? ((tasks.data?.total ?? 0) + (tickets.data?.total ?? 0) > 0 ? '/tickets/approvals' : '/tickets/approvals?tab=checklists') : null,
    tasks,
    tickets,
    checklists,
    isPending,
    hasError,
    total,
  };
};
