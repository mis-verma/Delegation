import { useCallback, useMemo } from 'react';
import { CheckCircle2, Clock, Inbox, ShieldCheck, UserCheck } from 'lucide-react';
import { EmptyState, IconChip, InlineError, PageHeader, Skeleton } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { canApproveTicket, isDepartmentHead, stageOf, taskApprovalSubject } from '../../lib/ticketApproval';
import { approveTaskRun, rejectTaskRun } from '../verification/decisionRequests';
import { TaskRow } from '../verification/TicketTaskRows';
import { usePendingTasksQuery } from '../verification/usePendingTasksQuery';
import { useDeferredDecisions } from '../verification/useDeferredDecisions';
import { useNow } from '../verification/useChecklistQueue';
import { useRefreshAfterDecision } from '../verification/useRefreshAfterDecision';
import { formatWaiting } from '../verification/verificationModel';
import { useDepartmentsQuery, useTicketsBoardQuery } from './hook';
import { HeadRequestRow } from './approvals/HeadRequestRow';
import type { Ticket } from '../../api/ticket';
import type { Task } from '../../api/task';

const NO_TICKETS: Ticket[] = [];
const NO_TASKS: Task[] = [];

export const TicketApprovals = () => {
  const { user } = useAuth();
  const now = useNow();
  const tasksQuery = usePendingTasksQuery('pending_approval');
  const boardQuery = useTicketsBoardQuery();
  const { data: departments } = useDepartmentsQuery();
  const refresh = useRefreshAfterDecision();
  const { heldIds, schedule } = useDeferredDecisions({ afterSaved: refresh });

  const requests = useMemo(
    () => (boardQuery.data ?? NO_TICKETS)
      .filter((t) => !!t.awaitingHeadApproval && !t.declinedAt && !!user && isDepartmentHead(user, t))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [boardQuery.data, user],
  );
  const allTasks = tasksQuery.data?.data ?? NO_TASKS;
  const myTasks = useMemo(
    () => allTasks
      .filter((t) => stageOf(t) === 'HOD' && canApproveTicket(user, taskApprovalSubject(t)) && !heldIds.has(t.id))
      .sort((a, b) => new Date(a.submittedAt ?? a.updatedAt).getTime() - new Date(b.submittedAt ?? b.updatedAt).getTime()),
    [allTasks, user, heldIds],
  );
  const withPc = useMemo(
    () => allTasks.filter((t) => stageOf(t) === 'PC' && !!t.hodApprovedAt).length,
    [allTasks],
  );
  const waitingTotal = myTasks.length + requests.length;
  const oldestTimes = [
    ...myTasks.map((t) => new Date(t.submittedAt ?? t.updatedAt).getTime()),
    ...requests.map((t) => new Date(t.createdAt).getTime()),
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
      <PageHeader
        icon={ShieldCheck}
        title="Team approvals"
        subtitle="New ticket requests for your department, plus delegations your team finished. Decide on requests before anyone starts. Finished tickets go straight to PC."
      />

      <ul className="flex flex-wrap gap-2" aria-label="Summary">
        <li><IconChip icon={UserCheck} tone="bg-primary-600" label={`${waitingTotal} waiting for you`} labelClassName="tabular-nums" /></li>
        {oldest !== null && <li><IconChip icon={Clock} tone="bg-text-muted" label={`Oldest ${formatWaiting(oldest, now)}`} /></li>}
        <li><IconChip icon={CheckCircle2} tone="bg-success" label={`${withPc} with PC now`} labelClassName="tabular-nums" /></li>
      </ul>

      {(tasksQuery.isPending || boardQuery.isPending) && (
        <div className="flex flex-col gap-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      )}

      {(tasksQuery.isError || boardQuery.isError) && <InlineError message="We couldn't load everything. Check your connection and try again." onRetry={() => { void tasksQuery.refetch(); void boardQuery.refetch(); }} />}

      {!tasksQuery.isPending && !boardQuery.isPending && !tasksQuery.isError && !boardQuery.isError && waitingTotal === 0 && (
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
