import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { CheckCircle2, Clock, Inbox } from 'lucide-react';
import { EmptyState, IconChip, InlineError, SearchField, Skeleton } from '../../../components';
import { StatusFigureStats, type StatusFigureItem } from '../../dashboard/StatusFigureStats';
import { canApproveTicket, isDepartmentHeadOf, stageOf, taskApprovalSubject } from '../../../lib/ticketApproval';
import { useApprovers } from '../../checklist/useApprovalCover';
import { approveTaskRun, rejectTaskRun, type ChecklistCorrection } from '../../verification/decisionRequests';
import { TaskRow } from '../../verification/TicketTaskRows';
import { usePendingTasksQuery } from '../../verification/usePendingTasksQuery';
import { useDeferredDecisions } from '../../verification/useDeferredDecisions';
import { useNow } from '../../verification/useChecklistQueue';
import { useRefreshAfterDecision } from '../../verification/useRefreshAfterDecision';
import { formatWaiting } from '../../verification/verificationModel';
import { useDepartmentsQuery, useTicketsAwaitingHeadQuery } from '../hook';
import { HeadRequestRow } from './HeadRequestRow';
import { useAssignableUsersQuery, useTasksAwaitingHeadQuery } from '../../tasks/hook';
import { HeadTaskRequestRow } from '../../tasks/HeadTaskRequestRow';
import { awaitingRequests } from '../../tasks/taskFlow';
import type { Ticket } from '../../../api/ticket';
import type { Task } from '../../../api/task';

const NO_TICKETS: Ticket[] = [];
const NO_TASKS: Task[] = [];

type WorkStatus = 'all' | 'requests' | 'delegationRequests' | 'finished';

const STATUS_ITEMS: readonly StatusFigureItem<WorkStatus>[] = [
  { key: 'all', kind: 'pending', label: 'Waiting for you', short: 'Waiting', help: 'Everything waiting for your decision' },
  { key: 'requests', kind: 'due', label: 'Ticket requests', short: 'Tickets', help: 'New ticket requests for your department' },
  { key: 'delegationRequests', kind: 'total', label: 'Delegation requests', short: 'Delegations', help: 'New delegation requests for your department' },
  { key: 'finished', kind: 'completed', label: 'Finished work', short: 'Finished', help: 'Delegations your team finished, waiting for your approval' },
];

const isWorkStatus = (value: string | null): value is WorkStatus => STATUS_ITEMS.some((item) => item.key === value);

const SHOWN_IN: Record<WorkStatus, readonly WorkStatus[]> = {
  all: ['requests', 'delegationRequests', 'finished'],
  requests: ['requests'],
  delegationRequests: ['delegationRequests'],
  finished: ['finished'],
};

const matches = (title: string, q: string) => !q || title.toLowerCase().includes(q);

export const TeamWorkApprovals = () => {
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get('status');
  const status: WorkStatus = isWorkStatus(rawStatus) ? rawStatus : 'all';
  const q = params.get('q') ?? '';
  const needle = q.trim().toLowerCase();
  const setParam = useCallback((key: string, value: string | null) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
  }, [setParams]);
  const toggleStatus = (key: WorkStatus) => setParam('status', key === 'all' || key === status ? null : key);
  const approvers = useApprovers();
  const now = useNow();
  const tasksQuery = usePendingTasksQuery('pending_approval');
  const boardQuery = useTicketsAwaitingHeadQuery();
  const { data: departments } = useDepartmentsQuery();
  const allTasksQuery = useTasksAwaitingHeadQuery();
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
  const personName = (p: { firstName: string; lastName?: string | null } | null | undefined) => (p ? `${p.firstName}${p.lastName ? ` ${p.lastName}` : ''}` : undefined);
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
  const loading = tasksQuery.isPending || boardQuery.isPending || allTasksQuery.isPending;
  const failed = tasksQuery.isError || boardQuery.isError || allTasksQuery.isError;
  const counts: Record<WorkStatus, number> = { all: waitingTotal, requests: requests.length, delegationRequests: delegationRequests.length, finished: myTasks.length };
  const shown = SHOWN_IN[status];
  const visibleRequests = shown.includes('requests') ? requests.filter((t) => matches(t.title, needle)) : [];
  const visibleDelegationRequests = shown.includes('delegationRequests') ? delegationRequests.filter((t) => matches(t.title, needle)) : [];
  const visibleTasks = shown.includes('finished') ? myTasks.filter((t) => matches(t.title, needle)) : [];
  const visibleTotal = visibleRequests.length + visibleDelegationRequests.length + visibleTasks.length;
  const filtering = status !== 'all' || !!needle;

  const refetchAll = () => { void tasksQuery.refetch(); void boardQuery.refetch(); void allTasksQuery.refetch(); };

  const approveTask = useCallback((id: string, title: string) => {
    schedule({ id, kind: 'task', verb: 'Approved, now with the final approver (PC)', label: title, run: approveTaskRun(id) });
  }, [schedule]);
  const sendBackTask = useCallback((id: string, title: string, note: string, correction?: ChecklistCorrection) => {
    schedule({ id, kind: 'task', verb: 'Sent back', label: title, run: rejectTaskRun(id, note, correction) });
  }, [schedule]);

  return (
    <div className="flex w-full flex-col gap-5">
      <StatusFigureStats
        label="Approvals summary"
        items={STATUS_ITEMS}
        counts={counts}
        active={status === 'all' ? null : status}
        onToggle={toggleStatus}
        isLoading={loading}
        error={failed}
        onRetry={refetchAll}
      />

      <SearchField value={q} onChange={(value) => setParam('q', value || null)} label="Search approvals by title" placeholder="Search by title" className="sm:max-w-sm" />

      {!loading && !failed && (
        <ul className="flex flex-wrap gap-2" aria-label="Summary">
          {oldest !== null && <li><IconChip icon={Clock} tone="bg-text-muted" label={`Oldest ${formatWaiting(oldest, now)}`} /></li>}
          <li><IconChip icon={CheckCircle2} tone="bg-success" label={`${withPc} with the final approver (PC)`} labelClassName="tabular-nums" /></li>
        </ul>
      )}

      {loading && (
        <div className="flex flex-col gap-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      )}

      {failed && <InlineError message="We couldn't load everything. Check your connection and try again." onRetry={refetchAll} />}

      {!loading && !failed && waitingTotal === 0 && (
        <EmptyState icon={CheckCircle2} tone="success" title="All caught up" description="No requests or finished work are waiting for you. New items show up here as they come in." />
      )}

      {!loading && !failed && waitingTotal > 0 && filtering && visibleTotal === 0 && (
        <EmptyState
          icon={Inbox}
          tone="neutral"
          title="Nothing matches"
          description="Try a different search or pick another card above."
          action={{ label: 'Clear filters', onClick: () => setParams((prev) => { const next = new URLSearchParams(prev); next.delete('status'); next.delete('q'); return next; }, { replace: true }) }}
        />
      )}

      {visibleRequests.length > 0 && (
        <section aria-label="New requests" className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
          <h2 className="flex items-center gap-2 t-section font-display font-bold text-text">
            <span className="flex size-7 items-center justify-center rounded-lg bg-warning text-white" aria-hidden="true">
              <Inbox size={15} strokeWidth={2.4} />
            </span>
            New requests <span className="font-normal text-text-muted tabular-nums">· {visibleRequests.length}</span>
          </h2>
          <p className="t-meta font-medium text-text-muted">Sent to your department. Nobody can start until you decide.</p>
          </div>
          {visibleRequests.map((ticket) => (
            <HeadRequestRow
              key={ticket.id}
              ticket={ticket}
              now={now}
              departmentName={departments?.find((d) => d.id === ticket.departmentId)?.name}
            />
          ))}
        </section>
      )}

      {visibleDelegationRequests.length > 0 && (
        <section aria-label="New delegation requests" className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="flex items-center gap-2 t-section font-display font-bold text-text">
              <span className="flex size-7 items-center justify-center rounded-lg bg-info text-white" aria-hidden="true">
                <Inbox size={15} strokeWidth={2.4} />
              </span>
              New delegation requests <span className="font-normal text-text-muted tabular-nums">· {visibleDelegationRequests.length}</span>
            </h2>
            <p className="t-meta font-medium text-text-muted">Given to your department. Nobody can start until you decide.</p>
          </div>
          {visibleDelegationRequests.map((task) => (
            <HeadTaskRequestRow
              key={task.id}
              task={task}
              now={now}
              raiserName={personName(task.raisedBy) ?? nameOf(task.userId)}
              assigneeName={personName(task.assigneePerson) ?? nameOf(task.assigneeId)}
              departmentName={departments?.find((d) => d.id === task.departmentId)?.name}
            />
          ))}
        </section>
      )}

      {visibleTasks.length > 0 && (
        <section aria-label="Delegations" className="flex flex-col gap-3">
          <h2 className="t-section font-display font-bold text-text">Delegations <span className="font-normal text-text-muted tabular-nums">· {visibleTasks.length}</span></h2>
          {visibleTasks.map((task) => (
            <TaskRow key={task.id} task={task} now={now} departmentName={null} raisedByName={null} onApprove={approveTask} onSendBack={sendBackTask} />
          ))}
        </section>
      )}
    </div>
  );
};
