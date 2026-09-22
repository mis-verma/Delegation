import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  ShieldCheck,
  Check,
  X,
  Loader2,
  Ticket as TicketIcon,
  CheckSquare,
  CheckCircle2,
  Repeat,
  ChevronRight,
  ChevronDown,
  Building2,
  Users,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, GradientIconTile, EmptyState } from '../../components';
import { StatCard } from '../dashboard/StatCard';
import { Breadcrumbs, type BreadcrumbTrailItem } from '../../components/breadcrumbs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select';
import { useTicketsByStatusQuery, useVerifyTicketMutation, useDepartmentsQuery, useStoresQuery, useAssignableUsersQuery } from '../tickets/hook';
import { useTasksByStatusQuery, useVerifyTaskMutation, useTaskQuery } from '../tasks/hook';
import { usePendingVerificationChecklistInstancesQuery, useVerifyChecklistInstanceMutation } from '../checklist/hook';
import { formatDate } from '../checklist/checklistDisplay';
import { ChecklistCompletionPreview } from './ChecklistCompletionPreview';
import { summarizeChecklists } from './checklistSummary';
import { TicketDetail } from '../tickets/TicketDetail';
import { TaskDetail } from '../tasks/TaskDetail';
import type { Ticket } from '../../api/ticket';
import type { Task } from '../../api/task';
import type { ChecklistInstance } from '../../api/checklistInstances';

type AgeFilter = 'any' | 1 | 3 | 7;
type DeptSection = 'all' | 'tickets' | 'delegations';

const ALL = 'all';
const UNASSIGNED = '__unassigned__';
const AGE_OPTIONS: { value: AgeFilter; label: string }[] = [
  { value: 'any', label: 'Any age' },
  { value: 1, label: '1+ day old' },
  { value: 3, label: '3+ days old' },
  { value: 7, label: '7+ days old' },
];

/** Visually-hidden native checkbox + styled box — same pattern StoreMultiSelect.tsx uses, so
 *  selection checkboxes look and behave the same wherever the app has them. */
const SelectCheckbox = ({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) => (
  <label className="relative flex items-center justify-center size-5 shrink-0 cursor-pointer" onClick={(e) => e.stopPropagation()}>
    <input type="checkbox" className="peer sr-only" checked={checked} onChange={onChange} aria-label={label} />
    <div
      className={`flex items-center justify-center size-5 rounded-md border transition-colors duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/50 ${
        checked ? 'bg-primary-600 border-primary-600 text-white' : 'bg-surface border-border hover:border-primary-400'
      }`}
    >
      <Check size={13} strokeWidth={3} className={`transition-all duration-150 ${checked ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`} />
    </div>
  </label>
);

interface QueueRowProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onOpen: () => void;
  onApprove: (note?: string) => void;
  onReject: (note: string) => void;
  isPending: boolean;
  /** Bulk-select checkbox — only present inside a department's ticket/task list, never on the
   *  ungrouped Checklists section (checklists carry no department to bulk-approve by). */
  selection?: { checked: boolean; onToggle: () => void };
  /** Checklist completion (done/not-done, photo evidence) — the thing a verifier actually needs
   *  to check before approving, which used to mean leaving the queue for the full detail page.
   *  Controlled by the parent (TicketRow/TaskRow) rather than owned here, since a Task row's
   *  checklist data has to be lazily fetched the first time it's expanded (see TaskRow) — that
   *  fetch is keyed off the same `expanded` boolean this drives. */
  expanded: boolean;
  onToggleExpanded: () => void;
  /** Render-prop instead of a plain node — lets the preview's per-item flag button reach back into
   *  this row's own correction-note textarea (via the `flagForCorrection` it's handed) without the
   *  note/rejecting state having to live any higher up than it already does. */
  preview: (flagForCorrection: (label: string) => void) => React.ReactNode;
  /** Done/total/missing-photo rollup, shown as a compact badge even before the row is expanded —
   *  the thing a verifier used to have to open the row (or leave the queue) to find out. */
  summary?: { total: number; done: number; missingPhotos: number };
}

const QueueRow = ({ icon, title, subtitle, onOpen, onApprove, onReject, isPending, selection, expanded, onToggleExpanded, preview, summary }: QueueRowProps) => {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');

  // A flagged item both opens the correction panel and appends a reference to it into the note,
  // rather than making the verifier retype what they just read in the preview above. Re-flagging
  // the same item twice doesn't duplicate the line.
  const flagForCorrection = (label: string) => {
    setRejecting(true);
    const line = `• ${label}: needs attention`;
    setNote((prev) => (prev.includes(line) ? prev : prev ? `${prev}\n${line}` : line));
  };

  const complete = summary && summary.total > 0 && summary.done === summary.total && summary.missingPhotos === 0;
  const attentionNeeded = summary && summary.total > 0 && (summary.done < summary.total || summary.missingPhotos > 0);

  return (
    // rounded-2xl + border-color-only hover — was rounded-xl with hover:shadow-sm, the one card
    // in the app that didn't follow the no-box-shadow convention every other card here uses.
    <div className={`group flex flex-col p-4 rounded-2xl border transition-all duration-200 ${
      selection?.checked ? 'border-primary-500 bg-primary-50/40 dark:bg-primary-500/[0.06]' : 'border-border/60 bg-surface/60 hover:bg-surface/90 hover:border-border-hover'
    }`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">

        <div className="flex items-center gap-3 min-w-0 flex-1">
          {selection && (
            <SelectCheckbox checked={selection.checked} onChange={selection.onToggle} label={`Select ${title}`} />
          )}

          {/* Info Section — its own button, not the whole row, so it doesn't nest one interactive
              element (a clickable row) around two others (Approve/Reject) and a textarea. Clicking
              it opens the real ticket/task/checklist detail instead of the row being a dead end. */}
          <button
            type="button"
            onClick={onOpen}
            className="group/info flex items-start sm:items-center gap-3.5 min-w-0 flex-1 text-left cursor-pointer outline-none rounded-lg focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <div className="flex items-center justify-center text-primary-500 shrink-0">
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-display font-medium text-text truncate group-hover/info:text-primary-600 dark:group-hover/info:text-primary-400 transition-colors">{title}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <p className="text-xs font-display text-text-muted truncate">{subtitle}</p>
                {/* Completion at a glance, no click required — same "how much is actually done"
                    read the expanded preview below gives, just visible before opening it. */}
                {summary && summary.total > 0 && (
                  <span className={`inline-flex items-center gap-1 shrink-0 text-[10px] font-display font-bold px-1.5 py-0.5 rounded ${
                    complete ? 'bg-success/10 text-success' : attentionNeeded ? 'bg-danger/10 text-danger' : 'bg-border/40 text-text-muted'
                  }`}>
                    {attentionNeeded && <AlertTriangle size={10} strokeWidth={2.5} />}
                    {summary.done}/{summary.total} done
                    {summary.missingPhotos > 0 && ` · ${summary.missingPhotos} photo${summary.missingPhotos === 1 ? '' : 's'} missing`}
                  </span>
                )}
              </div>
            </div>
            <ChevronRight size={15} strokeWidth={2.5} className="shrink-0 text-text-light opacity-0 group-hover/info:opacity-100 transition-opacity duration-200 sm:hidden group-hover/info:sm:inline" />
          </button>
        </div>

        {/* Action Buttons */}
        {!rejecting && (
          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            {/* What was actually done, and is the photo proof there — the thing a verifier needs
                to check before deciding Approve/Reject, previously only visible by leaving the
                queue for the full detail page. */}
            <button
              type="button"
              onClick={onToggleExpanded}
              aria-expanded={expanded}
              className="inline-flex items-center gap-1 h-9 px-2.5 rounded-lg text-xs font-display font-semibold text-text-secondary hover:bg-surface-hover hover:text-text transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <ChevronDown size={14} strokeWidth={2.5} className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
              <span className="hidden sm:inline">{expanded ? 'Hide' : 'Checklist'}</span>
            </button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-danger/30 text-danger hover:bg-danger/10 hover:border-danger/50 hover:text-danger transition-colors"
              disabled={isPending}
              onClick={() => setRejecting(true)}
            >
              <X size={14} />
              {/* Not a hard reject — this sends the item back to its assignee to fix and resubmit
                  (see task.service.ts#verify / ticket.service.ts#verify), so it's labeled for what
                  it actually does rather than reading as a terminal rejection. */}
              <span className="hidden sm:inline">Request Correction</span>
            </Button>
            <Button
              size="sm"
              variant="primary"
              className="gap-1.5 bg-success hover:bg-success/90 shadow-sm shadow-success/20"
              disabled={isPending}
              onClick={() => onApprove()}
            >
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Approve
            </Button>
          </div>
        )}
      </div>

      {/* Checklist completion preview — what the row-level toggle above reveals. */}
      {expanded && (
        <div className="pt-4 mt-4 border-t border-border/50 animate-in fade-in slide-in-from-top-2 duration-200">
          {preview(flagForCorrection)}
        </div>
      )}

      {/* Rejecting Expansion State */}
      {rejecting && (
        <div className="flex flex-col gap-3 pt-4 mt-4 border-t border-border/50 animate-in fade-in slide-in-from-top-2 duration-200">
          <textarea
            autoFocus
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Please detail what needs to be fixed before approval..."
            rows={2}
            className="w-full px-3.5 py-2.5 text-sm bg-surface/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-danger/20 focus:border-danger/50 resize-none transition-all placeholder:text-text-muted/50"
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => { setRejecting(false); setNote(''); }}
              className="text-text-muted hover:text-text"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="primary"
              className="bg-danger hover:bg-danger/90 shadow-sm shadow-danger/20"
              disabled={isPending || !note.trim()}
              onClick={() => onReject(note.trim())}
            >
              {isPending ? <Loader2 size={14} className="animate-spin" /> : 'Send Back for Revision'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

const TicketRow = ({ ticket, selection }: { ticket: Ticket; selection?: QueueRowProps['selection'] }) => {
  const verifyMut = useVerifyTicketMutation();
  // Ticket's own list endpoint already returns full checklist/item/image data (see
  // ticket.service.ts#populateTickets, shared by list() and getById()) — no extra fetch needed.
  const [expanded, setExpanded] = useState(false);
  // Opens TicketDetail in place — a side sheet layered over this same page — instead of navigating
  // to /tickets. Leaving the queue to look at one item used to lose the department/filter/scroll
  // position you were mid-review in; this keeps all of it underneath.
  const [showDetail, setShowDetail] = useState(false);
  return (
    <>
      <QueueRow
        icon={<TicketIcon size={18} />}
        title={ticket.title}
        subtitle={ticket.assignee ? `Handled by ${ticket.assignee.firstName}` : 'Unassigned'}
        isPending={verifyMut.isPending}
        selection={selection}
        expanded={expanded}
        onToggleExpanded={() => setExpanded((v) => !v)}
        summary={summarizeChecklists(ticket.checklists)}
        preview={(flag) => <ChecklistCompletionPreview checklists={ticket.checklists} isLoading={false} onFlagItem={(item) => flag(item.label)} />}
        onOpen={() => setShowDetail(true)}
        onApprove={(note) => verifyMut.mutate({ id: ticket.id, payload: { action: 'APPROVE', note } })}
        onReject={(note) => verifyMut.mutate({ id: ticket.id, payload: { action: 'REJECT', note } })}
      />
      {showDetail && <TicketDetail ticket={ticket} onClose={() => setShowDetail(false)} />}
    </>
  );
};

const TaskRow = ({ task, selection }: { task: Task; selection?: QueueRowProps['selection'] }) => {
  const verifyMut = useVerifyTaskMutation();
  // Unlike Ticket, a Task's LIST response never carries checklist data (see task.service.ts#list)
  // — only getById does. Fetched lazily, gated on `expanded`, so opening the queue doesn't fire a
  // full-detail request for every pending delegation up front.
  const [expanded, setExpanded] = useState(false);
  const { data: fullTask, isPending: isDetailPending } = useTaskQuery(task.id, expanded);
  // Same in-place pattern as TicketRow — TaskDetail is its own overlay (a centered modal, matching
  // how a delegation's detail looks everywhere else in the app) and re-fetches full detail by id
  // itself, so handing it this row's own `task` as a starting point is enough.
  const [showDetail, setShowDetail] = useState(false);
  return (
    <>
      <QueueRow
        icon={<CheckSquare size={18} />}
        title={task.title}
        subtitle={task.dueDate ? `Due ${new Date(task.dueDate).toLocaleDateString()}` : 'No due date'}
        isPending={verifyMut.isPending}
        selection={selection}
        expanded={expanded}
        onToggleExpanded={() => setExpanded((v) => !v)}
        // Once expanded, fullTask?.checklists is the fresher source (it's what the preview itself
        // renders); until then this falls back to the list endpoint's batched rollup so the badge
        // still shows without waiting on the per-row detail fetch.
        summary={expanded && fullTask ? summarizeChecklists(fullTask.checklists) : task.checklistSummary}
        preview={(flag) => <ChecklistCompletionPreview checklists={fullTask?.checklists} isLoading={isDetailPending} onFlagItem={(item) => flag(item.label)} />}
        onOpen={() => setShowDetail(true)}
        onApprove={(note) => verifyMut.mutate({ id: task.id, payload: { action: 'APPROVE', note } })}
        onReject={(note) => verifyMut.mutate({ id: task.id, payload: { action: 'REJECT', note } })}
      />
      {showDetail && <TaskDetail task={fullTask ?? task} onClose={() => setShowDetail(false)} />}
    </>
  );
};

const ChecklistRow = ({ instance }: { instance: ChecklistInstance }) => {
  const navigate = useNavigate();
  const verifyMut = useVerifyChecklistInstanceMutation();
  const [expanded, setExpanded] = useState(false);
  const previewChecklists = instance.items ? [{ id: instance.id, title: instance.title, items: instance.items }] : [];
  return (
    <QueueRow
      icon={<Repeat size={18} />}
      title={instance.title}
      subtitle={`${formatDate(instance.periodStart)} – ${formatDate(instance.periodEnd)} · every item checked off`}
      isPending={verifyMut.isPending}
      expanded={expanded}
      onToggleExpanded={() => setExpanded((v) => !v)}
      summary={summarizeChecklists(previewChecklists)}
      preview={(flag) => <ChecklistCompletionPreview checklists={previewChecklists} isLoading={false} onFlagItem={(item) => flag(item.label)} />}
      onOpen={() => navigate(`/checklists/${instance.id}`)}
      onApprove={(note) => verifyMut.mutate({ id: instance.id, payload: { action: 'APPROVE', note } })}
      onReject={(note) => verifyMut.mutate({ id: instance.id, payload: { action: 'REJECT', note } })}
    />
  );
};

const SkeletonRow = () => (
  <div className="flex items-center gap-3.5 p-4 rounded-2xl border border-border/40 bg-surface/30 animate-pulse">
    <div className="size-10 rounded-lg bg-border/50 shrink-0" />
    <div className="flex-1 space-y-2.5 py-1">
      <div className="h-4 bg-border/60 rounded w-1/3 sm:w-1/4" />
      <div className="h-3 bg-border/40 rounded w-1/2 sm:w-1/3" />
    </div>
    <div className="hidden sm:flex items-center gap-2">
      <div className="h-8 w-20 bg-border/40 rounded-md" />
      <div className="h-8 w-24 bg-border/60 rounded-md" />
    </div>
  </div>
);

/** Thin wrapper around the shared EmptyState — every call site here is the same "queue actually
 *  cleared" read, just a different noun. */
const QueueEmptyState = ({ label }: { label: string }) => (
  <EmptyState icon={CheckCircle2} tone="success" title="All caught up" description={`No ${label} waiting for verification.`} />
);

interface DepartmentGroup {
  id: string;
  name: string;
  tickets: Ticket[];
  tasks: Task[];
}

/** One department's pending-review pile — click through to review it, either bulk-approving
 *  everything of a kind at once or working item by item inside. */
const DepartmentGroupCard = ({ group, onClick }: { group: DepartmentGroup; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="group flex flex-col gap-3 p-4 rounded-2xl border border-border/60 bg-surface text-left hover:border-primary-300 transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30"
  >
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`flex items-center justify-center size-9 rounded-lg shrink-0 ${group.id === UNASSIGNED ? 'bg-surface-hover text-text-muted' : 'bg-primary-500/10 text-primary-600 dark:text-primary-400'}`}>
          {group.id === UNASSIGNED ? <Users size={16} /> : <Building2 size={16} />}
        </div>
        <h3 className="text-sm font-display font-bold text-text truncate">{group.name}</h3>
      </div>
      <ChevronRight size={15} className="shrink-0 text-text-light group-hover:text-primary-500 group-hover:translate-x-0.5 transition-all duration-150" />
    </div>

    <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/60">
      <span className="text-xs font-display font-medium text-text-muted">
        <strong className="font-display font-bold text-text">{group.tickets.length}</strong> tickets · <strong className="font-display font-bold text-text">{group.tasks.length}</strong> delegations
      </span>
      <span className="inline-flex items-center justify-center text-[11px] font-display font-bold px-2 py-0.5 rounded bg-primary-600 text-white">
        {group.tickets.length + group.tasks.length} pending
      </span>
    </div>
  </button>
);

const CHECKLIST_PAGE_SIZE = 20;

export const VerificationQueue = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const departmentId = searchParams.get('dept');

  // Single-stage verify: one PC/ADMIN/manager/reviewer check decides the whole thing — the old
  // two-stage QC-then-approval split (a separate, org-wide APPROVAL_MANAGER-only queue below this
  // one) is gone.
  const { data: tickets = [], isPending: ticketsPending } = useTicketsByStatusQuery('PENDING_APPROVAL');
  const { data: tasks = [], isPending: tasksPending } = useTasksByStatusQuery('pending_approval');

  // Paged, not the old flat `limit: 200` — a queue that's actually 200+ deep is exactly the case
  // "Load more" exists for; fetching all 200 up front on every visit was the thing standing in
  // for pagination instead of a real one.
  // Infinite, not a growing flat `limit` — growing `limit` refetched every already-loaded row from
  // offset 0 on every click. useInfiniteQuery fetches and caches each page exactly once.
  const { data: checklistResponse, isPending: checklistsPending, fetchNextPage: fetchNextChecklistPage, hasNextPage: checklistHasMore } = usePendingVerificationChecklistInstancesQuery(CHECKLIST_PAGE_SIZE);
  // Memoized — `.pages.flatMap(...) ?? []` would otherwise hand back a fresh array reference every
  // render, which the filteredChecklists useMemo below depends on transitively.
  const checklists = useMemo(() => checklistResponse?.pages.flatMap((p) => p.data) ?? [], [checklistResponse]);
  const checklistTotal = checklistResponse?.pages[0]?.meta?.total ?? checklists.length;

  const [storeId, setStoreId] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [age, setAge] = useState<AgeFilter>('any');
  const [section, setSection] = useState<DeptSection>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);

  const { data: departmentsData = [] } = useDepartmentsQuery();
  const { data: storesData = [] } = useStoresQuery();
  const { data: peopleData = [] } = useAssignableUsersQuery();
  const stores = useMemo(() => [...storesData].sort((a, b) => a.name.localeCompare(b.name)), [storesData]);
  const people = useMemo(
    () => [...peopleData].sort((a, b) => `${a.firstName} ${a.lastName ?? ''}`.localeCompare(`${b.firstName} ${b.lastName ?? ''}`)),
    [peopleData],
  );

  // eslint-disable-next-line react-hooks/purity
  const now = useMemo(() => Date.now(), []);
  const ageCutoff = age === 'any' ? null : now - age * 86_400_000;

  // Store/Person/Age apply wherever that dimension exists on the record — Tasks carry no store,
  // Checklist instances carry no department, so a filter that doesn't apply to a type just
  // excludes it, same convention the Dashboard's Compliance card scope filters use.
  const filteredTickets = useMemo(() => tickets.filter((t) =>
    (!storeId || t.storeId === storeId) &&
    (!personId || t.assigneeId === personId) &&
    (ageCutoff == null || new Date(t.createdAt).getTime() <= ageCutoff),
  ), [tickets, storeId, personId, ageCutoff]);

  const filteredTasks = useMemo(() => tasks.filter((t) =>
    !storeId &&
    (!personId || t.assigneeId === personId) &&
    (ageCutoff == null || new Date(t.createdAt).getTime() <= ageCutoff),
  ), [tasks, storeId, personId, ageCutoff]);

  const filteredChecklists = useMemo(() => checklists.filter((c) =>
    (!storeId || c.storeId === storeId) &&
    (!personId || c.assigneeIds?.includes(personId)) &&
    (ageCutoff == null || new Date(c.periodStart).getTime() <= ageCutoff),
  ), [checklists, storeId, personId, ageCutoff]);

  // Department-first grouping — every pending ticket/task bucketed by its department, department
  // names looked up once, "Unassigned" collecting anything with no department at all rather than
  // silently dropping it. Checklists have no department field to group by at all, so they stay
  // their own ungrouped, always-visible section below instead of being forced into a group they
  // don't actually belong to.
  const departmentGroups = useMemo<DepartmentGroup[]>(() => {
    const byId = new Map<string, DepartmentGroup>();
    const nameOf = (id: string | null) => id ? (departmentsData.find((d) => d.id === id)?.name ?? 'Unknown department') : 'Unassigned';
    for (const t of filteredTickets) {
      const key = t.departmentId ?? UNASSIGNED;
      if (!byId.has(key)) byId.set(key, { id: key, name: nameOf(t.departmentId), tickets: [], tasks: [] });
      byId.get(key)!.tickets.push(t);
    }
    for (const t of filteredTasks) {
      const key = t.departmentId ?? UNASSIGNED;
      if (!byId.has(key)) byId.set(key, { id: key, name: nameOf(t.departmentId), tickets: [], tasks: [] });
      byId.get(key)!.tasks.push(t);
    }
    return [...byId.values()].sort((a, b) => a.id === UNASSIGNED ? 1 : b.id === UNASSIGNED ? -1 : a.name.localeCompare(b.name));
  }, [filteredTickets, filteredTasks, departmentsData]);

  const selectedGroup = departmentGroups.find((g) => g.id === departmentId);
  const openDepartment = (id: string) => setSearchParams({ dept: id });
  const backToDepartments = () => setSearchParams({});

  // Selection is meaningless once you leave the department you selected items in, or once the
  // section filter changes what's on screen — cleared on either rather than silently carrying
  // stale ids into a bulk-approve call for rows that are no longer visible. Reset during render
  // (React's recommended way to reset state on a prop/derived-value change) rather than an
  // effect, which would set state synchronously inside itself and trigger a second render.
  const [prevSelectionKey, setPrevSelectionKey] = useState(`${departmentId}:${section}`);
  const selectionKey = `${departmentId}:${section}`;
  if (selectionKey !== prevSelectionKey) {
    setPrevSelectionKey(selectionKey);
    setSelectedIds(new Set());
  }

  const visibleTickets = selectedGroup && (section === 'all' || section === 'tickets') ? selectedGroup.tickets : [];
  const visibleTasks = selectedGroup && (section === 'all' || section === 'delegations') ? selectedGroup.tasks : [];
  const selectableIds = [...visibleTickets, ...visibleTasks].map((i) => i.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  const toggleSelect = (id: string) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(selectableIds));

  const verifyTicketMut = useVerifyTicketMutation();
  const verifyTaskMut = useVerifyTaskMutation();

  const bulkApprove = async () => {
    if (!selectedGroup || selectedIds.size === 0) return;
    setBulkApproving(true);
    const ticketIds = selectedGroup.tickets.filter((t) => selectedIds.has(t.id)).map((t) => t.id);
    const taskIds = selectedGroup.tasks.filter((t) => selectedIds.has(t.id)).map((t) => t.id);
    const results = await Promise.allSettled([
      ...ticketIds.map((id) => verifyTicketMut.mutateAsync({ id, payload: { action: 'APPROVE' } })),
      ...taskIds.map((id) => verifyTaskMut.mutateAsync({ id, payload: { action: 'APPROVE' } })),
    ]);
    setBulkApproving(false);
    setSelectedIds(new Set());
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed === 0) toast.success(`Approved ${results.length} item${results.length === 1 ? '' : 's'}`);
    else toast.error(`Approved ${results.length - failed} of ${results.length} — ${failed} failed, try those individually`);
  };

  const totalItems = tickets.length + tasks.length + checklistTotal;
  const scoped = !!(storeId || personId || age !== 'any');

  const breadcrumbs: BreadcrumbTrailItem[] = [
    { label: 'Verification Queue', to: departmentId ? '/verify' : undefined },
    ...(departmentId ? [{ label: selectedGroup?.name ?? '…' }] : []),
  ];

  return (
    // max-w-(--container-width), not a page-local max-w-5xl — the narrower fixed width used to
    // leave much bigger side margins here than on every other page (Tasks/Tickets/Team Overview),
    // which mattered more once this page grew a card grid that wants the room.
    <div className="flex flex-col gap-6 w-full max-w-(--container-width) mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <GradientIconTile icon={ShieldCheck} size="lg" />
        <div>
          <h1 className="text-2xl font-display font-bold text-text tracking-tight">Verification Queue</h1>
          <p className="text-sm font-display text-text-muted mt-0.5">
            {totalItems === 0
              ? 'Your queue is completely clear'
              : `${totalItems} item${totalItems !== 1 ? 's' : ''} waiting on your review`}
          </p>
        </div>
      </div>

      {!departmentId && (
        <>
          {/* Per-type counts — a plain summary now, since department cards are how you actually
              get to the items, not a filter to toggle. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <StatCard label="Tickets" value={filteredTickets.length} icon={TicketIcon} />
            <StatCard label="Delegations" value={filteredTasks.length} icon={CheckSquare} />
            <StatCard label="Checklists" value={filteredChecklists.length} icon={Repeat} />
          </div>

          {/* Departments — right under the stat cards, the primary way into tickets/delegations
              now (not buried below the ungrouped Checklists section). Click into one to review
              its items, individually or as a bulk approve. */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xs font-display font-bold text-text-muted tracking-wide">By department</h2>
            </div>
            {ticketsPending || tasksPending ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-[104px] rounded-2xl border border-border/40 bg-surface/30 animate-pulse" />)}
              </div>
            ) : departmentGroups.length === 0 ? (
              <QueueEmptyState label="tickets or delegations" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {departmentGroups.map((group) => (
                  <DepartmentGroupCard key={group.id} group={group} onClick={() => openDepartment(group.id)} />
                ))}
              </div>
            )}
          </section>

          {/* Filters — Store/Person/Age narrow both the department cards above and the ungrouped
              Checklists section below. Department itself isn't a filter here anymore — it's the
              department cards you tap into. */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={storeId ?? ALL} onValueChange={(v) => setStoreId(v === ALL ? null : v)}>
              <SelectTrigger size="sm" className="w-auto min-w-[8.5rem]" aria-label="Filter by store">
                <SelectValue placeholder="All stores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All stores</SelectItem>
                {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={personId ?? ALL} onValueChange={(v) => setPersonId(v === ALL ? null : v)}>
              <SelectTrigger size="sm" className="w-auto min-w-[8.5rem]" aria-label="Filter by assignee">
                <SelectValue placeholder="All people" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All people</SelectItem>
                {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.firstName}{p.lastName ? ` ${p.lastName}` : ''}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={String(age)} onValueChange={(v) => setAge(v === 'any' ? 'any' : (Number(v) as AgeFilter))}>
              <SelectTrigger size="sm" className="w-auto min-w-[8rem]" aria-label="Filter by age">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGE_OPTIONS.map((o) => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {scoped && (
            <p className="text-[11px] font-display font-medium text-text-light -mt-2">
              Scoped view — items with no matching {[storeId && 'store', personId && 'assignee'].filter(Boolean).join('/') || 'dimension'} are excluded.
            </p>
          )}

          {/* Checklists — ungrouped, always here, always one-by-one (no department to bulk by). */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xs font-display font-bold text-text-muted tracking-wide">Checklists</h2>
              {!checklistsPending && filteredChecklists.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-border/50 text-[10px] font-display font-medium text-text-muted">
                  {filteredChecklists.length}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-3">
              {checklistsPending && (<><SkeletonRow /><SkeletonRow /></>)}
              {!checklistsPending && filteredChecklists.length === 0 && <QueueEmptyState label="checklists" />}
              {filteredChecklists.map(c => <ChecklistRow key={c.id} instance={c} />)}
            </div>

            {!checklistsPending && checklistHasMore && (
              <button
                type="button"
                onClick={() => fetchNextChecklistPage()}
                className="self-center inline-flex items-center gap-1.5 h-9 px-4 rounded-xl border border-border/60 bg-surface text-xs font-display font-semibold text-text-secondary hover:bg-surface-hover hover:border-border hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 transition-all duration-200 cursor-pointer"
              >
                Load more ({checklistTotal - checklists.length} remaining)
              </button>
            )}
          </section>
        </>
      )}

      {departmentId && (
        selectedGroup ? (
          <>
            <Breadcrumbs items={breadcrumbs} />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by type">
                {([['all', 'All'], ['tickets', 'Tickets'], ['delegations', 'Delegations']] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSection(value)}
                    aria-pressed={section === value}
                    className={`h-9 px-3 rounded-full border text-[12px] font-display font-semibold transition-all duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                      section === value ? 'bg-primary-600 border-primary-600 text-white' : 'bg-transparent border-border/50 text-text-secondary hover:border-border hover:text-text'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {selectableIds.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="text-xs font-display font-semibold text-text-secondary hover:text-text transition-colors duration-150 cursor-pointer"
                  >
                    {allSelected ? 'Clear selection' : 'Select all'}
                  </button>
                  <Button
                    size="sm"
                    variant="primary"
                    className="gap-1.5 bg-success hover:bg-success/90 shadow-sm shadow-success/20"
                    disabled={selectedIds.size === 0 || bulkApproving}
                    onClick={bulkApprove}
                  >
                    {bulkApproving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    Approve {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'selected'}
                  </Button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-8">
              {(section === 'all' || section === 'tickets') && (
                <section className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-xs font-display font-bold text-text-muted tracking-wide">Tickets</h2>
                    {visibleTickets.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-border/50 text-[10px] font-display font-medium text-text-muted">{visibleTickets.length}</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-3">
                    {visibleTickets.length === 0 && <QueueEmptyState label="tickets" />}
                    {visibleTickets.map(t => (
                      <TicketRow key={t.id} ticket={t} selection={{ checked: selectedIds.has(t.id), onToggle: () => toggleSelect(t.id) }} />
                    ))}
                  </div>
                </section>
              )}

              {(section === 'all' || section === 'delegations') && (
                <section className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-xs font-display font-bold text-text-muted tracking-wide">Delegations</h2>
                    {visibleTasks.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-border/50 text-[10px] font-display font-medium text-text-muted">{visibleTasks.length}</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-3">
                    {visibleTasks.length === 0 && <QueueEmptyState label="delegations" />}
                    {visibleTasks.map(t => (
                      <TaskRow key={t.id} task={t} selection={{ checked: selectedIds.has(t.id), onToggle: () => toggleSelect(t.id) }} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          </>
        ) : (
          // Department id in the URL no longer matches a group (everything in it just got
          // approved, or the store/person/age filters changed) — back out cleanly instead of
          // showing a dead empty screen with no way forward.
          <div className="flex flex-col items-center gap-3 py-10">
            <QueueEmptyState label="items in this department" />
            <button
              type="button"
              onClick={backToDepartments}
              className="text-xs font-display font-semibold text-primary-600 dark:text-primary-400 hover:underline cursor-pointer"
            >
              Back to all departments
            </button>
          </div>
        )
      )}
    </div>
  );
};
