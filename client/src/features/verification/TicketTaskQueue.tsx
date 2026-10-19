import { useCallback, useMemo, useState } from 'react';
import { Check, Loader2, CheckCircle2, SearchX, ChevronRight, Building2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button, EmptyState, Skeleton, useConfirm } from '../../components';
import { approveTaskRun, approveTicketRun, rejectTaskRun, rejectTicketRun } from './decisionRequests';
import type { DecisionRequest } from './useDeferredDecisions';
import { TicketRow, TaskRow } from './TicketTaskRows';
import { UNASSIGNED, type QueueTab } from './verificationModel';
import type { Ticket } from '../../api/ticket';
import type { Task } from '../../api/task';

interface DepartmentGroup {
  id: string;
  name: string;
  tickets: Ticket[];
  tasks: Task[];
}

const DepartmentGroupCard = ({ group, onOpen }: { group: DepartmentGroup; onOpen: (id: string) => void }) => (
  <button
    type="button"
    onClick={() => onOpen(group.id)}
    className="flex flex-col gap-3 p-4 rounded-xl border border-border/60 bg-surface text-left hover:border-border-hover transition-colors duration-150 ease-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30"
  >
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center justify-center size-9 rounded-lg shrink-0 bg-surface-hover text-text-muted">
          {group.id === UNASSIGNED ? <Users size={16} aria-hidden /> : <Building2 size={16} aria-hidden />}
        </div>
        <h3 className="t-card font-display font-bold text-text truncate">{group.name}</h3>
      </div>
      <ChevronRight size={15} aria-hidden className="shrink-0 text-text-light" />
    </div>

    <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/60">
      <span className="t-meta font-display font-medium text-text-muted">
        <strong className="font-display font-bold text-text">{group.tickets.length}</strong> tickets, <strong className="font-display font-bold text-text">{group.tasks.length}</strong> delegations
      </span>
      <span className="t-meta font-display font-semibold text-text-muted tabular-nums">
        {group.tickets.length + group.tasks.length} pending
      </span>
    </div>
  </button>
);

const SectionTitle = ({ title, count }: { title: string; count?: number }) => (
  <div className="flex items-center gap-2">
    <h2 className="t-section font-display font-bold text-text">{title}</h2>
    {count != null && count > 0 && (
      <span className="px-2 py-0.5 rounded-full bg-border/50 t-meta font-display font-medium text-text-muted tabular-nums">{count}</span>
    )}
  </div>
);

interface TicketTaskQueueProps {
  tab: QueueTab;
  tickets: Ticket[];
  tasks: Task[];
  isPending: boolean;
  departmentId: string | null;
  departmentNameOf: (id: string | null) => string;
  filtersActive: boolean;
  onOpenDepartment: (id: string) => void;
  onClearDepartment: () => void;
  onClearFilters: () => void;
  now: number;
  personNameById: ReadonlyMap<string, string>;
  decisions: {
    heldIds: ReadonlySet<string>;
    schedule: (request: DecisionRequest) => void;
    hold: (ids: string[]) => void;
    release: (ids: string[]) => void;
  };
  refresh: () => Promise<unknown>;
}

export const TicketTaskQueue = ({
  tab, tickets: allTickets, tasks: allTasks, isPending, departmentId, departmentNameOf, filtersActive, onOpenDepartment, onClearDepartment, onClearFilters,
  now, personNameById, decisions, refresh,
}: TicketTaskQueueProps) => {
  const confirm = useConfirm();
  const { heldIds, schedule, hold, release } = decisions;
  const tickets = useMemo(() => allTickets.filter((t) => !heldIds.has(t.id)), [allTickets, heldIds]);
  const tasks = useMemo(() => allTasks.filter((t) => !heldIds.has(t.id)), [allTasks, heldIds]);

  const showTickets = tab === 'all' || tab === 'tickets';
  const showTasks = tab === 'all' || tab === 'delegations';

  const groups = useMemo<DepartmentGroup[]>(() => {
    const byId = new Map<string, DepartmentGroup>();
    const bucket = (deptId: string | null) => {
      const key = deptId ?? UNASSIGNED;
      let group = byId.get(key);
      if (!group) {
        group = { id: key, name: departmentNameOf(deptId), tickets: [], tasks: [] };
        byId.set(key, group);
      }
      return group;
    };
    if (showTickets) for (const t of tickets) bucket(t.departmentId).tickets.push(t);
    if (showTasks) for (const t of tasks) bucket(t.departmentId).tasks.push(t);
    return [...byId.values()].sort((a, b) => a.id === UNASSIGNED ? 1 : b.id === UNASSIGNED ? -1 : a.name.localeCompare(b.name));
  }, [tickets, tasks, showTickets, showTasks, departmentNameOf]);

  const group = groups.find((g) => g.id === departmentId);

  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const selectionKey = `${departmentId}:${tab}`;
  const [prevKey, setPrevKey] = useState(selectionKey);
  if (selectionKey !== prevKey) {
    setPrevKey(selectionKey);
    setSelectedIds(new Set());
  }

  const visibleTickets = useMemo(() => (group && showTickets ? group.tickets : []), [group, showTickets]);
  const visibleTasks = useMemo(() => (group && showTasks ? group.tasks : []), [group, showTasks]);
  const selectableIds = useMemo(() => [...visibleTickets, ...visibleTasks].map((i) => i.id), [visibleTickets, visibleTasks]);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  const toggleSelect = useCallback((id: string) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(selectableIds));

  const approveItem = useCallback((kind: 'ticket' | 'task') => (id: string, title: string) => {
    schedule({ id, verb: 'Approved', label: title, run: kind === 'ticket' ? approveTicketRun(id) : approveTaskRun(id) });
  }, [schedule]);
  const sendBackItem = useCallback((kind: 'ticket' | 'task') => (id: string, title: string, note: string) => {
    schedule({ id, verb: 'Sent back', label: title, run: kind === 'ticket' ? rejectTicketRun(id, note) : rejectTaskRun(id, note) });
  }, [schedule]);
  const approveTicket = useMemo(() => approveItem('ticket'), [approveItem]);
  const approveTask = useMemo(() => approveItem('task'), [approveItem]);
  const sendBackTicket = useMemo(() => sendBackItem('ticket'), [sendBackItem]);
  const sendBackTask = useMemo(() => sendBackItem('task'), [sendBackItem]);

  const bulkApprove = async () => {
    if (!group || selectedIds.size === 0) return;
    const ticketIds = group.tickets.filter((t) => selectedIds.has(t.id)).map((t) => t.id);
    const taskIds = group.tasks.filter((t) => selectedIds.has(t.id)).map((t) => t.id);
    const total = ticketIds.length + taskIds.length;
    const ok = await confirm({
      title: `Approve ${total} ${total === 1 ? 'item' : 'items'}?`,
      description: 'They are approved right away, without opening each one. Anything you want to look at first, leave unticked.',
      confirmLabel: `Approve ${total}`,
    });
    if (!ok) return;
    setBulkApproving(true);
    const ids = [...ticketIds, ...taskIds];
    hold(ids);
    const results = await Promise.allSettled([
      ...ticketIds.map((id) => approveTicketRun(id)({ keepalive: false })),
      ...taskIds.map((id) => approveTaskRun(id)({ keepalive: false })),
    ]);
    try { await refresh(); } catch { }
    release(ids);
    setBulkApproving(false);
    setSelectedIds(new Set());
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed === 0) toast.success(`Approved ${results.length} item${results.length === 1 ? '' : 's'}`);
    else toast.error(`Approved ${results.length - failed} of ${results.length}. ${failed} failed, try those one by one.`);
  };

  const emptyState = filtersActive ? (
    <EmptyState
      icon={SearchX}
      title="Nothing matches these filters"
      description="Try a wider age, another store or person, or clear the search."
      action={{ label: 'Clear filters', onClick: onClearFilters }}
    />
  ) : (
    <EmptyState icon={CheckCircle2} tone="success" title="All caught up" description="No tickets or delegations waiting for verification." />
  );

  if (isPending) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3" aria-hidden>
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)}
      </div>
    );
  }

  if (!departmentId) {
    return groups.length === 0 ? emptyState : (
      <section className="flex flex-col gap-3" aria-label="Tickets and delegations by department">
        <SectionTitle title="Tickets and delegations by department" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {groups.map((g) => <DepartmentGroupCard key={g.id} group={g} onOpen={onOpenDepartment} />)}
        </div>
      </section>
    );
  }

  if (!group) {
    return (
      <div className="flex flex-col items-center gap-3">
        {emptyState}
        <Button variant="secondary" size="sm" onClick={onClearDepartment}>Back to all departments</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {selectableIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={toggleSelectAll}>{allSelected ? 'Clear selection' : 'Select all'}</Button>
          <Button
            size="sm"
            className="bg-success-strong text-white hover:bg-success-strong/90 hover:text-white"
            disabled={selectedIds.size === 0 || bulkApproving}
            onClick={bulkApprove}
          >
            {bulkApproving ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Check size={14} aria-hidden />}
            Approve {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'selected'}
          </Button>
        </div>
      )}

      {showTickets && (
        <section className="flex flex-col gap-3" aria-label="Tickets">
          <SectionTitle title="Tickets" count={visibleTickets.length} />
          <div className="flex flex-col gap-3">
            {visibleTickets.length === 0 && <EmptyState size="compact" icon={CheckCircle2} tone="success" title="No tickets waiting here" />}
            {visibleTickets.map((t) => (
              <TicketRow
                key={t.id}
                ticket={t}
                now={now}
                departmentName={t.departmentId ? departmentNameOf(t.departmentId) : null}
                raisedByName={personNameById.get(t.userId) ?? null}
                onApprove={approveTicket}
                onSendBack={sendBackTicket}
                selected={selectedIds.has(t.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        </section>
      )}

      {showTasks && (
        <section className="flex flex-col gap-3" aria-label="Delegations">
          <SectionTitle title="Delegations" count={visibleTasks.length} />
          <div className="flex flex-col gap-3">
            {visibleTasks.length === 0 && <EmptyState size="compact" icon={CheckCircle2} tone="success" title="No delegations waiting here" />}
            {visibleTasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                now={now}
                departmentName={t.departmentId ? departmentNameOf(t.departmentId) : null}
                raisedByName={personNameById.get(t.userId) ?? null}
                onApprove={approveTask}
                onSendBack={sendBackTask}
                selected={selectedIds.has(t.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
