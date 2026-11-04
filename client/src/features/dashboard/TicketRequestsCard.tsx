import { useMemo } from 'react';
import { CheckCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNow } from '../../lib/useNow';
import { isDepartmentHeadOf } from '../../lib/ticketApproval';
import { useApprovers } from '../checklist/useApprovalCover';
import { Skeleton } from '../../components/skeleton';
import { InlineError } from '../../components/inlineError';
import { PANEL_CLASS } from '../../components/entityCard';
import { DashCardHeader, DashCardLink } from './DashCardHeader';
import { useDepartmentsQuery, useTicketsAwaitingHeadQuery } from '../tickets/hook';
import { HeadRequestRow } from '../tickets/approvals/HeadRequestRow';
import { useAssignableUsersQuery, useTasksAwaitingHeadQuery } from '../tasks/hook';
import { HeadTaskRequestRow } from '../tasks/HeadTaskRequestRow';
import { awaitingRequests } from '../tasks/taskFlow';
import { ApprovalLink, type ApprovalRow } from './NeedsApprovalCard';
import { useApprovalSources } from './useApprovalSources';
import type { Ticket } from '../../api/ticket';
import type { Task } from '../../api/task';

const NO_TICKETS: Ticket[] = [];
const NO_TASKS: Task[] = [];
const PREVIEW_LIMIT = 3;
const FINISHED_PREVIEW_LIMIT = 3;
const NO_ROWS: ApprovalRow[] = [];

type RequestItem = { kind: 'ticket'; at: number; ticket: Ticket } | { kind: 'task'; at: number; task: Task };

export const TicketRequestsCard = () => {
  const { user } = useAuth();
  const approvers = useApprovers();
  const now = useNow();
  const isAdmin = user?.role === 'ADMIN';
  const isHod = user?.role === 'MANAGER' || user?.role === 'SENIOR';
  const allowed = isAdmin || isHod;
  const board = useTicketsAwaitingHeadQuery(allowed);
  const tasksQuery = useTasksAwaitingHeadQuery(allowed);
  const { data: departments } = useDepartmentsQuery(allowed);
  const { data: people } = useAssignableUsersQuery();
  const sources = useApprovalSources();
  const showFinished = isHod;

  const requests = useMemo<RequestItem[]>(() => {
    const tickets = (board.data ?? NO_TICKETS)
      .filter((t) => !!t.awaitingHeadApproval && !t.declinedAt && (isAdmin || isDepartmentHeadOf(approvers, t)))
      .map((ticket): RequestItem => ({ kind: 'ticket', at: new Date(ticket.createdAt).getTime(), ticket }));
    const delegations = awaitingRequests(tasksQuery.data ?? NO_TASKS, approvers, isAdmin)
      .map((task): RequestItem => ({ kind: 'task', at: new Date(task.createdAt).getTime(), task }));
    return [...tickets, ...delegations].sort((a, b) => a.at - b.at);
  }, [board.data, tasksQuery.data, approvers, isAdmin]);

  const finished = useMemo<ApprovalRow[]>(() => {
    if (!showFinished) return NO_ROWS;
    const rows: ApprovalRow[] = [
      ...(sources.tasks.data?.rows ?? []).map((t): ApprovalRow => ({
        id: t.id, category: 'delegation', title: t.title, meta: t.submittedBy, waitingSince: t.waitingSince, link: `/tasks?open=${t.id}`,
      })),
      ...(sources.checklists.data?.rows ?? []).map((c): ApprovalRow => ({
        id: c.id, category: 'checklist', title: c.title, meta: c.storeName, waitingSince: c.waitingSince, link: `/checklists/${c.id}`,
      })),
    ];
    return rows.sort((a, b) => new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime());
  }, [showFinished, sources.tasks.data, sources.checklists.data]);

  const nameOf = (id: string | null | undefined) => {
    const person = id ? people?.find((p) => p.id === id) : undefined;
    return person ? `${person.firstName}${person.lastName ? ` ${person.lastName}` : ''}` : undefined;
  };

  if (!allowed) return null;
  const pending = board.isPending || tasksQuery.isPending || (showFinished && sources.isPending);
  const failed = (board.isError && board.data === undefined) || (tasksQuery.isError && tasksQuery.data === undefined) || (showFinished && sources.hasError);
  const finishedTotal = showFinished ? sources.total : 0;
  const everything = requests.length + finishedTotal;
  if (isAdmin && !pending && !failed && requests.length === 0) return null;
  const title = showFinished ? 'Approvals' : 'Requests to decide';
  if (pending) {
    return (
      <section aria-label="Loading requests" role="status" className={`${PANEL_CLASS} flex h-full flex-col overflow-hidden`}>
        <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3 sm:px-5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-9 w-20 rounded-full" />
        </div>
        <div className="flex flex-col divide-y divide-border/60">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="flex min-h-14 flex-col justify-center gap-1.5 px-4 py-3 sm:px-5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3.5 w-1/3" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  const visible = requests.slice(0, PREVIEW_LIMIT);
  const remaining = requests.length - visible.length;
  const finishedVisible = finished.slice(0, FINISHED_PREVIEW_LIMIT);
  const finishedRemaining = finishedTotal - finishedVisible.length;
  const reviewHref = showFinished && requests.length === 0 && finishedTotal > 0 && (sources.tasks.data?.total ?? 0) === 0 ? '/tickets/approvals?tab=checklists' : '/tickets/approvals';
  const oldestHours = requests.length ? Math.floor((now - requests[0].at) / 3_600_000) : 0;
  const ticketCount = requests.filter((r) => r.kind === 'ticket').length;
  const delegationCount = requests.length - ticketCount;
  const breakdown = [
    ticketCount > 0 && `${ticketCount} ${ticketCount === 1 ? 'ticket' : 'tickets'}`,
    delegationCount > 0 && `${delegationCount} ${delegationCount === 1 ? 'delegation' : 'delegations'}`,
    finishedTotal > 0 && `${finishedTotal} finished`,
  ].filter(Boolean).join(', ');

  if (!failed && everything === 0) {
    return (
      <section aria-labelledby="ticket-requests-heading" className={`${PANEL_CLASS} flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5 sm:px-5`}>
        <div className="flex min-w-0 items-center gap-2">
          <CheckCheck className="size-4 shrink-0 text-success" strokeWidth={2.5} aria-hidden="true" />
          <h2 id="ticket-requests-heading" className="t-card font-display font-bold text-text">{title}</h2>
          <p className="t-meta font-medium text-text-muted">{showFinished ? 'Nothing waiting' : 'No requests waiting'}</p>
        </div>
        <DashCardLink to="/tickets/approvals" label="Open Team approvals">Team approvals</DashCardLink>
      </section>
    );
  }

  return (
    <section aria-labelledby="ticket-requests-heading" className={`${PANEL_CLASS} flex h-full flex-col overflow-hidden`}>
      <DashCardHeader
        id="ticket-requests-heading"
        title={title}
        count={failed ? null : everything}
        countLabel={breakdown || `${everything} waiting`}
        alert={oldestHours >= 24}
        subtitle={breakdown || (isAdmin ? 'Tickets and delegations waiting for a department head' : 'New requests to decide, then finished work to approve')}
        action={everything > 0 ? <DashCardLink to={reviewHref}>Open all</DashCardLink> : undefined}
      />

      {failed && (
        <div className="px-4 py-3 sm:px-5">
          <InlineError message="Couldn't load the requests." onRetry={() => { void board.refetch(); void tasksQuery.refetch(); if (showFinished) { void sources.tasks.refetch(); void sources.checklists.refetch(); } }} />
        </div>
      )}

      {requests.length > 0 && (
        <div className="flex flex-col divide-y divide-border/60">
          {oldestHours >= 4 && (
            <p className={`px-4 py-2 sm:px-5 t-meta font-display font-semibold ${oldestHours >= 24 ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'}`}>
              {oldestHours >= 24 ? 'The oldest request has waited over a day. Decide it now.' : `The oldest request has waited ${oldestHours} hours.`}
            </p>
          )}
          {visible.map((r) => r.kind === 'ticket' ? (
            <HeadRequestRow
              key={`k-${r.ticket.id}`}
              ticket={r.ticket}
              now={now}
              embedded
              departmentName={isAdmin ? departments?.find((d) => d.id === r.ticket.departmentId)?.name : undefined}
            />
          ) : (
            <HeadTaskRequestRow
              key={`t-${r.task.id}`}
              task={r.task}
              now={now}
              embedded
              raiserName={nameOf(r.task.userId)}
              assigneeName={nameOf(r.task.assigneeId)}
              departmentName={isAdmin ? departments?.find((d) => d.id === r.task.departmentId)?.name : undefined}
            />
          ))}
        </div>
      )}

      {remaining > 0 && <p className="border-t border-border/60 px-4 py-2.5 sm:px-5 t-meta font-medium text-text-muted">{remaining} more requests waiting</p>}

      {finishedVisible.length > 0 && (
        <div className="flex flex-col divide-y divide-border/60 border-t border-border/60">
          <h3 className="px-4 py-2 sm:px-5 t-meta font-display font-bold text-text-muted">Finished work to approve</h3>
          {finishedVisible.map((row) => <ApprovalLink key={`${row.category}-${row.id}`} row={row} now={now} />)}
        </div>
      )}
      {finishedRemaining > 0 && <p className="border-t border-border/60 px-4 py-2.5 sm:px-5 t-meta font-medium text-text-muted">{finishedRemaining} more finished waiting</p>}
    </section>
  );
};
