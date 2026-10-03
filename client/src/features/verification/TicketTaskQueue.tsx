import { useCallback, useMemo, useState } from 'react';
import { Check, Loader2, CheckCircle2, SearchX, ChevronRight, Building2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button, EmptyState, Skeleton } from '../../components';
import { useVerifyTicketMutation } from '../tickets/hook';
import { useVerifyTaskMutation } from '../tasks/hook';
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

/** One department's pending pile. Click through to review it item by item or approve in bulk. */
const DepartmentGroupCard = ({ group, onOpen }: { group: DepartmentGroup; onOpen: (id: string) => void }) => (
  <button
    type="button"
    onClick={() => onOpen(group.id)}
    className="group flex flex-col gap-3 p-4 rounded-2xl border border-border/60 bg-surface text-left hover:border-primary-300 transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30"
  >
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`flex items-center justify-center size-9 rounded-lg shrink-0 ${group.id === UNASSIGNED ? 'bg-surface-hover text-text-muted' : 'bg-primary-500/10 text-primary-600 dark:text-primary-400'}`}>
          {group.id === UNASSIGNED ? <Users size={16} aria-hidden /> : <Building2 size={16} aria-hidden />}
        </div>
        <h3 className="text-sm font-display font-bold text-text truncate">{group.name}</h3>
      </div>
      <ChevronRight size={15} aria-hidden className="shrink-0 text-text-light group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all duration-150" />
    </div>

    <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/60">
      <span className="text-xs font-display font-medium text-text-muted">
        <strong className="font-display font-bold text-text">{group.tickets.length}</strong> tickets · <strong className="font-display font-bold text-text">{group.tasks.length}</strong> delegations
      </span>
      <span className="inline-flex items-center justify-center text-[11px] font-display font-bold px-2 py-0.5 rounded bg-primary-600 text-white">
        {group.tickets.length + group.tasks.length} pending
      </span>
    </div>
  </button>
);

const SectionTitle = ({ title, count }: { title: string; count?: number }) => (
  <div className="flex items-center gap-2">
    <h2 className="text-sm font-display font-semibold text-text">{title}</h2>
    {count != null && count > 0 && (
      <span className="px-2 py-0.5 rounded-full bg-border/50 text-[11px] font-display font-medium text-text-muted tabular-nums">{count}</span>
    )}
  </div>
);

interface TicketTaskQueueProps {
  tab: QueueTab;
  /** Already narrowed by store / person / age / search. */
  tickets: Ticket[];
  tasks: Task[];
  isPending: boolean;
  /** The department open in the drill-in, if any. */
  departmentId: string | null;
  departmentNameOf: (id: string | null) => string;
  filtersActive: boolean;
  onOpenDepartment: (id: string) => void;
  onClearDepartment: () => void;
  onClearFilters: () => void;
}

/** Tickets and delegations waiting for review: department cards, then a department's own list with bulk approve. */
export const TicketTaskQueue = ({
  tab, tickets, tasks, isPending, departmentId, departmentNameOf, filtersActive, onOpenDepartment, onClearDepartment, onClearFilters,
}: TicketTaskQueueProps) => {
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

  // Selection is meaningless once you leave the department it was made in, or switch tab. Reset
  // while rendering (React's way to reset state when an input changes) rather than in an effect.
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

  const verifyTicket = useVerifyTicketMutation();
  const verifyTask = useVerifyTaskMutation();

  const bulkApprove = async () => {
    if (!group || selectedIds.size === 0) return;
    setBulkApproving(true);
    const ticketIds = group.tickets.filter((t) => selectedIds.has(t.id)).map((t) => t.id);
    const taskIds = group.tasks.filter((t) => selectedIds.has(t.id)).map((t) => t.id);
    const results = await Promise.allSettled([
      ...ticketIds.map((id) => verifyTicket.mutateAsync({ id, payload: { action: 'APPROVE' } })),
      ...taskIds.map((id) => verifyTask.mutateAsync({ id, payload: { action: 'APPROVE' } })),
    ]);
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
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-2xl" />)}
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

  // The department in the URL no longer matches a group (everything in it was just approved, or the
  // filters changed): back out cleanly instead of leaving a dead empty screen.
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
            className="bg-success text-white hover:bg-success/90 hover:text-white"
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
            {visibleTickets.map((t) => <TicketRow key={t.id} ticket={t} selected={selectedIds.has(t.id)} onToggleSelect={toggleSelect} />)}
          </div>
        </section>
      )}

      {showTasks && (
        <section className="flex flex-col gap-3" aria-label="Delegations">
          <SectionTitle title="Delegations" count={visibleTasks.length} />
          <div className="flex flex-col gap-3">
            {visibleTasks.length === 0 && <EmptyState size="compact" icon={CheckCircle2} tone="success" title="No delegations waiting here" />}
            {visibleTasks.map((t) => <TaskRow key={t.id} task={t} selected={selectedIds.has(t.id)} onToggleSelect={toggleSelect} />)}
          </div>
        </section>
      )}
    </div>
  );
};
