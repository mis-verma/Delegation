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

  const tasks = useTaskPendingApprovalQuery(reviewsAllWork, DASHBOARD_QUERY_OPTIONS);
  const tickets = useTicketPendingApprovalQuery(reviewsAllWork, DASHBOARD_QUERY_OPTIONS);
  const checklists = useChecklistPendingApprovalQuery(asksChecklists, DASHBOARD_QUERY_OPTIONS);

  const reportsErrors = reviewsAllWork || isHod;

  const isPending = (reviewsAllWork && (tasks.isPending || tickets.isPending)) || (asksChecklists && checklists.isPending);
  const hasError = reportsErrors && ((reviewsAllWork && (tasks.isError || tickets.isError)) || checklists.isError);

  const total =
    (reviewsAllWork ? (tasks.data?.total ?? 0) + (tickets.data?.total ?? 0) : 0) +
    (checklists.data?.total ?? 0);

  return {
    reviewsAllWork,
    isHod,
    reportsErrors,
    queueHref: reviewsAllWork ? '/verify' : isHod ? '/checklists/approvals' : null,
    tasks,
    tickets,
    checklists,
    isPending,
    hasError,
    total,
  };
};
