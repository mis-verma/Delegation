import { useCallback, useMemo } from 'react';
import { CheckCircle2, Clock, ShieldCheck, UserCheck } from 'lucide-react';
import { EmptyState, IconChip, InlineError, PageHeader, Skeleton } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { canApproveTicket, stageOf, taskApprovalSubject } from '../../lib/ticketApproval';
import { approveTaskRun, approveTicketRun, rejectTaskRun, rejectTicketRun } from '../verification/decisionRequests';
import { TaskRow, TicketRow } from '../verification/TicketTaskRows';
import { usePendingTasksQuery } from '../verification/usePendingTasksQuery';
import { useDeferredDecisions } from '../verification/useDeferredDecisions';
import { useNow } from '../verification/useChecklistQueue';
import { useRefreshAfterDecision } from '../verification/useRefreshAfterDecision';
import { formatWaiting } from '../verification/verificationModel';
import { useTicketsByStatusQuery } from './hook';
import type { Ticket } from '../../api/ticket';
import type { Task } from '../../api/task';

const NO_TICKETS: Ticket[] = [];
const NO_TASKS: Task[] = [];

export const TicketApprovals = () => {
  const { user } = useAuth();
  const now = useNow();
  const query = useTicketsByStatusQuery('PENDING_APPROVAL');
  const tasksQuery = usePendingTasksQuery('pending_approval');
  const refresh = useRefreshAfterDecision();
  const { heldIds, schedule } = useDeferredDecisions({ afterSaved: refresh });

  const all = query.data?.data ?? NO_TICKETS;
  const mine = useMemo(
    () => all
      .filter((t) => stageOf(t) === 'HOD' && canApproveTicket(user, t) && !heldIds.has(t.id))
      .sort((a, b) => new Date(a.submittedAt ?? a.updatedAt).getTime() - new Date(b.submittedAt ?? b.updatedAt).getTime()),
    [all, user, heldIds],
  );
  const allTasks = tasksQuery.data?.data ?? NO_TASKS;
  const myTasks = useMemo(
    () => allTasks
      .filter((t) => stageOf(t) === 'HOD' && canApproveTicket(user, taskApprovalSubject(t)) && !heldIds.has(t.id))
      .sort((a, b) => new Date(a.submittedAt ?? a.updatedAt).getTime() - new Date(b.submittedAt ?? b.updatedAt).getTime()),
    [allTasks, user, heldIds],
  );
  const withPc = useMemo(
    () => all.filter((t) => stageOf(t) === 'PC' && !!t.hodApprovedAt).length + allTasks.filter((t) => stageOf(t) === 'PC' && !!t.hodApprovedAt).length,
    [all, allTasks],
  );
  const waitingTotal = mine.length + myTasks.length;
  const oldestTimes = [...mine, ...myTasks].map((t) => new Date(t.submittedAt ?? t.updatedAt).getTime());
  const oldest = oldestTimes.length ? Math.min(...oldestTimes) : null;

  const approve = useCallback((id: string, title: string) => {
    schedule({ id, verb: 'Approved, sent to PC', label: title, run: approveTicketRun(id) });
  }, [schedule]);
  const sendBack = useCallback((id: string, title: string, note: string) => {
    schedule({ id, verb: 'Sent back', label: title, run: rejectTicketRun(id, note) });
  }, [schedule]);
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
        subtitle="Tickets and delegations your team finished. You approve first, then they go to PC for the final check."
      />

      <ul className="flex flex-wrap gap-2" aria-label="Summary">
        <li><IconChip icon={UserCheck} tone="bg-primary-600" label={`${waitingTotal} waiting for you`} labelClassName="tabular-nums" /></li>
        {oldest !== null && <li><IconChip icon={Clock} tone="bg-text-muted" label={`Oldest ${formatWaiting(oldest, now)}`} /></li>}
        <li><IconChip icon={CheckCircle2} tone="bg-success" label={`${withPc} with PC now`} labelClassName="tabular-nums" /></li>
      </ul>

      {(query.isPending || tasksQuery.isPending) && (
        <div className="flex flex-col gap-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      )}

      {(query.isError || tasksQuery.isError) && <InlineError message="We couldn't load everything. Check your connection and try again." onRetry={() => { void query.refetch(); void tasksQuery.refetch(); }} />}

      {!query.isPending && !tasksQuery.isPending && !query.isError && !tasksQuery.isError && waitingTotal === 0 && (
        <EmptyState icon={CheckCircle2} tone="success" title="All caught up" description="No finished work is waiting for you. New items show up here as your team hands them in." />
      )}

      {mine.length > 0 && (
        <section aria-label="Tickets" className="flex flex-col gap-3">
          <h2 className="t-section font-display font-bold text-text">Tickets <span className="font-normal text-text-muted tabular-nums">· {mine.length}</span></h2>
          {mine.map((ticket) => (
            <TicketRow
              key={ticket.id}
              ticket={ticket}
              now={now}
              departmentName={null}
              raisedByName={null}
              onApprove={approve}
              onSendBack={sendBack}
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
