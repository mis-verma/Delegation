import { useCallback, useMemo } from 'react';
import { CheckCircle2, Clock, Inbox, ShieldCheck, UserCheck } from 'lucide-react';
import { EmptyState, IconChip, InlineError, PageHeader, Skeleton } from '../../components';
import { canApproveTicket, isDepartmentHeadOf, stageOf, taskApprovalSubject } from '../../lib/ticketApproval';
import { useApprovers } from '../checklist/useApprovalCover';
import { approveTaskRun, rejectTaskRun } from '../verification/decisionRequests';
import { TaskRow } from '../verification/TicketTaskRows';
import { usePendingTasksQuery } from '../verification/usePendingTasksQuery';
import { useDeferredDecisions } from '../verification/useDeferredDecisions';
import { useNow } from '../verification/useChecklistQueue';
import { useRefreshAfterDecision } from '../verification/useRefreshAfterDecision';
import { formatWaiting } from '../verification/verificationModel';
import { useDepartmentsQuery, useTicketsAwaitingHeadQuery } from './hook';
import { HeadRequestRow } from './approvals/HeadRequestRow';
import { useAssignableUsersQuery, useTasksQuery } from '../tasks/hook';
import { HeadTaskRequestRow } from '../tasks/HeadTaskRequestRow';
import { awaitingRequests } from '../tasks/taskFlow';
import type { Ticket } from '../../api/ticket';
import type { Task } from '../../api/task';

const NO_TICKETS: Ticket[] = [];
const NO_TASKS: Task[] = [];

export const TicketApprovals = ({ embedded = false }: { embedded?: boolean }) => {
  const approvers = useApprovers();
  const now = useNow();
  const tasksQuery = usePendingTasksQuery('pending_approval');
  const boardQuery = useTicketsAwaitingHeadQuery();
  const { data: departments } = useDepartmentsQuery();
  const allTasksQuery = useTasksQuery();
  const { data: people } = useAssignableUsersQuery();
  const refresh = useRefreshAfterDecision();
  const { heldIds, schedule } = useDeferredDecisions({ afterSaved: refresh });

  const requests = useMemo(
    () => (boardQuery.data ?? NO_TICKETS)
      .filter((t) => !!t.awaitingHeadApproval && !t.declinedAt && isDepartmentHeadOf(approvers, t))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [boardQuery.data, approvers],
  );
  const delegationRequests = useMemo(() => awaitingRequests(allTasksQuery.data ?? NO_TASKS, approvers), [allTasksQuery.data, approvers]);
  const nameOf = (id: string | null | undefined) => {
    const person = id ? people?.find((p) => p.id === id) : undefined;
    return person ? `${person.firstName}${person.lastName ? ` ${person.lastName}` : ''}` : undefined;
  };
  const allTasks = tasksQuery.data?.data ?? NO_TASKS;
  const myTasks = useMemo(
    () => allTasks
      .filter((t) => stageOf(t) === 'HOD' && canApproveTicket(approvers, taskApprovalSubject(t)) && !heldIds.has(t.id))
      .sort((a, b) => new Date(a.submittedAt ?? a.updatedAt).getTime() - new Date(b.submittedAt ?? b.updatedAt).getTime()),
    [allTasks, approvers, heldIds],
  );
  const withPc = useMemo(
    () => allTasks.filter((t) => stageOf(t) === 'PC' && !!t.hodApprovedAt).length,
    [allTasks],
  );
  const waitingTotal = myTasks.length + requests.length + delegationRequests.length;
  const oldestTimes = [
    ...myTasks.map((t) => new Date(t.submittedAt ?? t.updatedAt).getTime()),
    ...requests.map((t) => new Date(t.createdAt).getTime()),
    ...delegationRequests.map((t) => new Date(t.createdAt).getTime()),
  ];
  const oldest = oldestTimes.length ? Math.min(...oldestTimes) : null;

  const approveTask = useCallback((id: string, title: string) => {
    schedule({ id, verb: 'Approved, sent to PC', label: title, run: approveTaskRun(id) });
  }, [schedule]);
  const sendBackTask = useCallback((id: string, title: string, note: string) => {
    schedule({ id, verb: 'Sent back', label: title, run: rejectTaskRun(id, note) });
  }, [schedule]);

  return (
    <div className="flex w-full flex-col gap-5">
      {!embedded && (
        <PageHeader
          icon={ShieldCheck}
          title="Team approvals"
          subtitle="New ticket and delegation requests for your department, plus delegations your team finished. Decide on requests before anyone starts. Finished tickets go straight to PC."
        />
      )}

      <ul className="flex flex-wrap gap-2" aria-label="Summary">
        <li><IconChip icon={UserCheck} tone="bg-primary-600" label={`${waitingTotal} waiting for you`} labelClassName="tabular-nums" /></li>
        {oldest !== null && <li><IconChip icon={Clock} tone="bg-text-muted" label={`Oldest ${formatWaiting(oldest, now)}`} /></li>}
        <li><IconChip icon={CheckCircle2} tone="bg-success" label={`${withPc} with PC now`} labelClassName="tabular-nums" /></li>
      </ul>

      {(tasksQuery.isPending || boardQuery.isPending || allTasksQuery.isPending) && (
        <div className="flex flex-col gap-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      )}

      {(tasksQuery.isError || boardQuery.isError || allTasksQuery.isError) && <InlineError message="We couldn't load everything. Check your connection and try again." onRetry={() => { void tasksQuery.refetch(); void boardQuery.refetch(); void allTasksQuery.refetch(); }} />}

      {!tasksQuery.isPending && !boardQuery.isPending && !allTasksQuery.isPending && !tasksQuery.isError && !boardQuery.isError && !allTasksQuery.isError && waitingTotal === 0 && (
        <EmptyState icon={CheckCircle2} tone="success" title="All caught up" description="No requests or finished work are waiting for you. New items show up here as they come in." />
      )}

      {requests.length > 0 && (
        <section aria-label="New requests" className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
          <h2 className="flex items-center gap-2 t-section font-display font-bold text-text">
            <span className="flex size-7 items-center justify-center rounded-lg bg-linear-to-br from-warning to-warning/70 text-white" aria-hidden="true">
              <Inbox size={15} strokeWidth={2.4} />
            </span>
            New requests <span className="font-normal text-text-muted tabular-nums">· {requests.length}</span>
          </h2>
          <p className="t-meta font-medium text-text-muted">Raised for your department. Nobody can start until you decide.</p>
          </div>
          {requests.map((ticket) => (
            <HeadRequestRow
              key={ticket.id}
              ticket={ticket}
              now={now}
              departmentName={departments?.find((d) => d.id === ticket.departmentId)?.name}
            />
          ))}
        </section>
      )}

      {delegationRequests.length > 0 && (
        <section aria-label="New delegation requests" className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="flex items-center gap-2 t-section font-display font-bold text-text">
              <span className="flex size-7 items-center justify-center rounded-lg bg-linear-to-br from-info to-info/70 text-white" aria-hidden="true">
                <Inbox size={15} strokeWidth={2.4} />
              </span>
              New delegation requests <span className="font-normal text-text-muted tabular-nums">· {delegationRequests.length}</span>
            </h2>
            <p className="t-meta font-medium text-text-muted">Given to your department. Nobody can start until you decide.</p>
          </div>
          {delegationRequests.map((task) => (
            <HeadTaskRequestRow
              key={task.id}
              task={task}
              now={now}
              raiserName={nameOf(task.userId)}
              assigneeName={nameOf(task.assigneeId)}
              departmentName={departments?.find((d) => d.id === task.departmentId)?.name}
            />
          ))}
        </section>
      )}

      {myTasks.length > 0 && (
        <section aria-label="Delegations" className="flex flex-col gap-3">
          <h2 className="t-section font-display font-bold text-text">Delegations <span className="font-normal text-text-muted tabular-nums">· {myTasks.length}</span></h2>
          {myTasks.map((task) => (
            <TaskRow key={task.id} task={task} now={now} departmentName={null} raisedByName={null} onApprove={approveTask} onSendBack={sendBackTask} />
          ))}
        </section>
      )}
    </div>
  );
};
