import { useAuth } from '../../context/AuthContext';
import { useTaskPendingApprovalQuery } from '../tasks/hook';
import { useTicketPendingApprovalQuery } from '../tickets/hook';
import { useChecklistPendingApprovalQuery } from '../checklist/hook';
import { DASHBOARD_QUERY_OPTIONS } from '../../lib/dashboardQuery';

// What this viewer is asked to approve, and where the full queue lives:
//   ADMIN/PC        tickets, delegations and checklists, org-wide   -> /verify
//   MANAGER/SENIOR  checklists in their own department              -> /checklists/approvals
//   anyone else     checklists they were named as a reviewer on, if any (no queue page of their own)
// The server scopes every preview, so asking is always safe; tickets and delegations are only
// requested for ADMIN/PC because the server only answers them for those roles.
//
// Shared by the Today strip and the Needs approval card so both read one set of requests: the query
// keys match, so React Query sends each request once.
export const useApprovalSources = () => {
  const { user } = useAuth();
  const role = user?.role;
  const reviewsAllWork = role === 'ADMIN' || role === 'PC';
  const isHod = role === 'MANAGER' || role === 'SENIOR';
  // A named reviewer can have any role, so the checklist preview is asked for by everyone who is
  // signed in. For people who review nothing it is just an empty answer.
  const asksChecklists = !!role;

  const tasks = useTaskPendingApprovalQuery(reviewsAllWork, DASHBOARD_QUERY_OPTIONS);
  const tickets = useTicketPendingApprovalQuery(reviewsAllWork, DASHBOARD_QUERY_OPTIONS);
  const checklists = useChecklistPendingApprovalQuery(asksChecklists, DASHBOARD_QUERY_OPTIONS);

  // Roles with a real approval job get told when a source fails. Everyone else is only checked for
  // reviewer duty on the side, so a failure there stays quiet rather than putting an error on the
  // home page of someone who approves nothing.
  const reportsErrors = reviewsAllWork || isHod;

  // A disabled query reports isPending forever, so "still loading" only counts sources that are on.
  const isPending = (reviewsAllWork && (tasks.isPending || tickets.isPending)) || (asksChecklists && checklists.isPending);
  const hasError = reportsErrors && ((reviewsAllWork && (tasks.isError || tickets.isError)) || checklists.isError);

  // Sum of the real queue sizes (not the preview row counts) of the sources that loaded. When a
  // source failed this is a floor, so callers check `hasError` before presenting it as the total.
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
