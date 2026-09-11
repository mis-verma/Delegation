import { useMemo, useState } from 'react';
import { AlertCircle, ClipboardCheck, X, Store, ChevronDown, Check, Clock, AlarmClock, ArrowDownAZ, Repeat, User, LayoutList, Table2, Kanban } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { Skeleton, PageNav, OptionsDialog, SortOptionRow, OptionRow, FilterGroup, FilterPill, SelectFilterRow, PeopleFilterRow, ViewToggle, type FilterOption, type ViewTab } from '../../../components';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useMyChecklistInstancesQuery, useChecklistInstanceSummaryQuery, useAssignableUsersQuery, useDepartmentsQuery } from '../hook';
import { useStoresQuery } from '../../tickets/hook';
import { toFilterPeople } from '../../../lib/filterPeople';
import { ChecklistInstanceCard } from './ChecklistInstanceCard';
import { ChecklistInstanceTable } from './ChecklistInstanceTable';
import { ChecklistInstanceBoard } from './ChecklistInstanceBoard';
import { MyChecklistsQuickStats, type MyChecklistsQuickFilterKey } from './MyChecklistsQuickStats';
import { RECURRENCE_LABEL, VERIFICATION_STATUS_LABEL } from '../checklistDisplay';
import type { ChecklistInstance, ChecklistInstanceStatus, ChecklistVerificationStatus } from '../../../api/checklistInstances';
import type { ChecklistRecurrence } from '../../../api/checklistDefinitions';

type View = 'list' | 'board' | 'table';
const VIEW_TABS: ViewTab<View>[] = [
  { key: 'list', label: 'List', icon: LayoutList },
  { key: 'board', label: 'Board', icon: Kanban },
  { key: 'table', label: 'Table', icon: Table2 },
];

// Same "Options" dialog shell Delegation and Tickets both use, plus a permanent Store scope box —
// the one facet checklist instances actually carry that those two pages already let you filter by.
type SortKey = 'recent' | 'dueSoonest' | 'titleAsc';
const SORT_LABEL: Record<SortKey, string> = { recent: 'Most recent', dueSoonest: 'Due soonest', titleAsc: 'Title A-Z' };
const SORT_ICON: Record<SortKey, typeof Clock> = { recent: Clock, dueSoonest: AlarmClock, titleAsc: ArrowDownAZ };
const SORT_COMPARATORS: Record<SortKey, (a: ChecklistInstance, b: ChecklistInstance) => number> = {
  recent: () => 0, // server already orders by periodStart desc — nothing to re-sort
  dueSoonest: (a, b) => new Date(a.periodEnd).getTime() - new Date(b.periodEnd).getTime(),
  titleAsc: (a, b) => a.title.localeCompare(b.title),
};

type GroupByKey = 'recurrence' | 'store' | 'person';
const GROUP_BY_LABEL: Record<GroupByKey, string> = { recurrence: 'Recurrence', store: 'Store', person: 'Person' };
const GROUP_BY_ICON: Record<GroupByKey, typeof Repeat> = { recurrence: Repeat, store: Store, person: User };

const RECURRENCE_OPTIONS: FilterOption<ChecklistRecurrence | ''>[] = [
  { value: '', label: 'All recurrences' },
  ...(Object.entries(RECURRENCE_LABEL) as [ChecklistRecurrence, string][]).map(([value, label]) => ({ value, label })),
];

const VERIFICATION_OPTIONS: FilterOption<ChecklistVerificationStatus | ''>[] = [
  { value: '', label: 'All' },
  ...(Object.entries(VERIFICATION_STATUS_LABEL) as [ChecklistVerificationStatus, string][]).map(([value, label]) => ({ value, label })),
];

// Same Pending/Due/Completed/Overdue split Delegation and Tickets both use. "Pending" is every
// not-every-item-done instance (overdue included) — mirrors the Dashboard's own KPI strip. "Due"
// is the on-track subset of that (not yet past its period end); "Overdue" is the subset that's run
// past it. These map onto the server's OPEN / DUE / COMPLETED / OVERDUE status filter (see
// `serverStatus` below) rather than being applied here over a fully-downloaded list.

const QUICK_FILTER_LABEL: Record<MyChecklistsQuickFilterKey, string> = {
  pending: 'Pending', completed: 'Completed', due: 'Due', overdue: 'Overdue',
};

const PAGE_SIZE = 50;

export const MyChecklists = () => {
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  // One-time-read-from-URL seed (same pattern as TicketList/TaskList/TodoPage's `quickFilter`) so
  // the Dashboard's "Due"/"Completed" rows still land on the matching subset here; from then on
  // the tiles below drive it directly, same as everywhere else this pattern is used.
  const [quickFilter, setQuickFilter] = useState<MyChecklistsQuickFilterKey | null>(() => {
    const sf = searchParams.get('status');
    return sf === 'pending' || sf === 'due' || sf === 'completed' || sf === 'overdue' ? sf : null;
  });
  // The tile now narrows the query itself instead of filtering an already-downloaded list —
  // `overdue`/`due` became real server statuses (relative to each instance's period end), which is
  // what let this endpoint start paginating at all.
  const serverStatus: ChecklistInstanceStatus | undefined =
    quickFilter === 'completed' ? 'COMPLETED'
    : quickFilter === 'pending' ? 'OPEN'
    : quickFilter === 'due' ? 'DUE'
    : quickFilter === 'overdue' ? 'OVERDUE'
    : undefined;

  // One-time-read-from-URL seed, same as `quickFilter` above.
  const [storeId, setStoreId] = useState<string>(() => searchParams.get('store') ?? '');
  const { data: stores } = useStoresQuery();
  const storeOptions = useMemo(() => (stores ?? []).filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.name })), [stores]);
  const storeNameById = useMemo(() => new Map(storeOptions.map((s) => [s.id, s.name])), [storeOptions]);

  // Board first: it groups by status (Due/Overdue/Completed) at a glance, which is what actually
  // matters day to day — List's default grouping (Recurrence) says nothing about urgency, and
  // Table is denser but built for scanning many rows, not spotting what's overdue right now.
  const [view, setView] = useState<View>('board');
  const [sort, setSort] = useState<SortKey>('recent');
  const [groupBy, setGroupBy] = useState<GroupByKey>('recurrence');
  const [recurrence, setRecurrence] = useState<ChecklistRecurrence | ''>('');
  const [verificationStatus, setVerificationStatus] = useState<ChecklistVerificationStatus | ''>('');
  // Instances have no departmentId of their own — this matches "at least one assignee belongs to
  // this department" server-side (see checklistInstance.service.ts's instanceIdsForDepartment).
  const [departmentId, setDepartmentId] = useState('');
  const { data: allDepartments } = useDepartmentsQuery();
  const departmentOptions: FilterOption<string>[] = useMemo(() => [
    { value: '', label: 'All departments' },
    ...(allDepartments ?? []).filter((d) => d.isActive).map((d) => ({ value: d.id, label: d.name })),
  ], [allDepartments]);
  // Who else an instance is shared with — checklist instances can carry more than one assignee
  // (e.g. "Store Opening Walkthrough"), so among *your* checklists this narrows to the ones a
  // specific co-assignee is also on. Resolved server-side (getMine/summary's own `assigneeIds`
  // param) — it used to filter only the already-fetched page client-side, which left the quick-
  // stat tiles and pagination total quoting the pre-filter counts while the visible list shrank.
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [showOptions, setShowOptions] = useState(false);

  const { data: assignableUsers } = useAssignableUsersQuery();
  const people = useMemo(() => toFilterPeople(assignableUsers), [assignableUsers]);
  const peopleNameById = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);

  const instanceFilter = {
    status: serverStatus,
    storeId: storeId || undefined,
    recurrence: recurrence || undefined,
    verificationStatus: verificationStatus || undefined,
    departmentId: departmentId || undefined,
    assigneeIds: assigneeIds.length ? assigneeIds : undefined,
  };
  const { data: allInstances = [], isPending, isError, refetch } = useMyChecklistInstancesQuery(instanceFilter, { page, limit: PAGE_SIZE });

  const activeOptionsCount = (sort !== 'recent' ? 1 : 0) + (recurrence ? 1 : 0) + (verificationStatus ? 1 : 0) + (departmentId ? 1 : 0) + (assigneeIds.length > 0 ? 1 : 0);
  const clearOptions = () => { setSort('recent'); setRecurrence(''); setVerificationStatus(''); setDepartmentId(''); setAssigneeIds([]); setPage(1); };

  const toggleQuickFilter = (key: MyChecklistsQuickFilterKey) => {
    setQuickFilter((prev) => (prev === key ? null : key));
    // Page 4 of the old filter is meaningless against the new one, and usually past its end.
    setPage(1);
    setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('status'); return p; });
  };

  const changeStore = (id: string) => {
    setStoreId(id);
    setPage(1);
    setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('store'); return p; });
  };

  // From the database, not from `allInstances.length`. Counting the fetched array is what forced
  // /mine to return every instance ever assigned; with the tiles independent of the list, the list
  // can page later without the numbers above it quietly turning into page sizes. Also scoped by
  // `storeId` so the tile counts and pagination total match the filtered list, not the whole roster.
  const { data: summary } = useChecklistInstanceSummaryQuery({
    mine: true,
    storeId: storeId || undefined,
    recurrence: recurrence || undefined,
    verificationStatus: verificationStatus || undefined,
    departmentId: departmentId || undefined,
    assigneeIds: assigneeIds.length ? assigneeIds : undefined,
  });
  const counts: Record<MyChecklistsQuickFilterKey, number> = {
    pending: summary?.pending ?? 0,
    completed: summary?.completed ?? 0,
    due: summary?.due ?? 0,
    overdue: summary?.overdue ?? 0,
  };

  // assigneeIds narrowing now happens server-side (both here and in the summary query above), so
  // this only needs to re-sort the page the server already scoped.
  const instances = useMemo(() => [...allInstances].sort(SORT_COMPARATORS[sort]), [allInstances, sort]);

  // How many rows the active filter matches — taken from the summary counts already fetched
  // above rather than a second request, since they're the same four numbers the tiles show.
  const matchingTotal =
    quickFilter === 'pending' ? counts.pending
    : quickFilter === 'completed' ? counts.completed
    : quickFilter === 'due' ? counts.due
    : quickFilter === 'overdue' ? counts.overdue
    : (summary?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(matchingTotal / PAGE_SIZE));

  // Grouped by Recurrence (default), Store, or Person — same "Group by" toggle Tickets' Options
  // dialog offers (Department/Person there). Person is the one case a single instance can land in
  // more than one group at once — a shared checklist (e.g. "Store Opening Walkthrough") has every
  // one of its assignees as a real group membership, not just one.
  const grouped = new Map<string, ChecklistInstance[]>();
  const addTo = (key: string, instance: ChecklistInstance) => {
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(instance);
  };
  for (const instance of instances) {
    if (groupBy === 'person') {
      if (!instance.assigneeIds.length) addTo('Unassigned', instance);
      else for (const id of instance.assigneeIds) addTo(peopleNameById.get(id) ?? 'Unknown', instance);
    } else if (groupBy === 'store') {
      addTo(instance.storeId ? (storeNameById.get(instance.storeId) ?? 'Unknown store') : 'No store', instance);
    } else {
      addTo(RECURRENCE_LABEL[instance.recurrence], instance);
    }
  }

  return (
    // Was `max-w-5xl` with no `mx-auto` — a 1024px cap, left-aligned, while every other top-level
    // page uses the shared 1536px container and centres. Moving between Delegation and Checklists
    // visibly jumped the content ~500px narrower and slammed it against the left edge.
    <div className="flex flex-col gap-6 mx-auto w-full max-w-(--container-width) transition-all duration-300">
      {/* Same header treatment as Delegation, Tickets and To-Do: no visible title block — the nav
          item that got you here already says My Checklists, and the lead "Assigned to you" tile
          carries the count. The heading stays as the page's one accessibility landmark. */}
      <h1 className="sr-only">My Checklists</h1>

      <MyChecklistsQuickStats
        counts={counts}
        total={summary?.total ?? 0}
        active={quickFilter}
        onToggle={toggleQuickFilter}
        onClear={() => setQuickFilter(null)}
        isLoading={isPending}
      />

      {/* Same "Store scope box + Options button" pair Delegation and Tickets both put in their own
          toolbar row — Store as a permanent, always-visible box (it's the one org-scope dimension
          checklist instances carry), Sort tucked inside Options since it's a view preference, not
          a narrowing filter. */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* View lives in the toolbar, not inside Options — same as Delegation/Tickets: it changes
            what the whole page looks like, so it reads as a place you are, not a setting. */}
        <ViewToggle tabs={VIEW_TABS} value={view} onChange={setView} />

        {quickFilter && (
          <span className="flex items-center gap-1.5 pl-3 pr-1.5 py-1 text-xs font-display font-medium rounded-full bg-primary-50 text-primary-700 border border-primary-200">
            Showing: {QUICK_FILTER_LABEL[quickFilter]}
            <button
              type="button"
              onClick={() => setQuickFilter(null)}
              aria-label="Clear status filter"
              className="p-1.5 rounded-full hover:bg-primary-100 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <X size={12} />
            </button>
          </span>
        )}

        <div className="flex items-center gap-2.5 flex-wrap shrink-0 ml-auto">
          {storeOptions.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Store scope: ${storeId ? (storeOptions.find((o) => o.id === storeId)?.name ?? 'Unknown') : 'All stores'}`}
                  className="group flex items-center gap-2 h-9 pl-3 pr-2.5 rounded-full border border-border bg-surface text-left transition-all duration-200 ease-in-out cursor-pointer hover:border-primary-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <Store size={15} strokeWidth={2.5} className="text-primary-600 shrink-0" />
                  <span className="text-xs font-medium text-text-muted hidden sm:inline">Store</span>
                  <span className="text-xs font-bold tracking-tight text-text truncate max-w-40">
                    {storeId ? (storeOptions.find((o) => o.id === storeId)?.name ?? 'Unknown') : 'All stores'}
                  </span>
                  <ChevronDown size={14} className="text-text-light group-hover:text-text-muted transition-colors shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 rounded-xl max-h-80 overflow-y-auto">
                {[{ id: '', name: 'All stores' }, ...storeOptions].map((option) => (
                  <DropdownMenuItem
                    key={option.id || 'all'}
                    onClick={() => changeStore(option.id)}
                    className="gap-2.5 py-2 cursor-pointer justify-between"
                  >
                    <span className="font-medium text-sm truncate">{option.name}</span>
                    {storeId === option.id && <Check size={14} className="text-primary-600 shrink-0" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <OptionsDialog
            isOpen={showOptions}
            setIsOpen={setShowOptions}
            title="Checklist options"
            activeCount={activeOptionsCount}
            onClearAll={clearOptions}
            canExport={false}
            onExport={() => {}}
          >
            <OptionRow label="Group by">
              <FilterGroup>
                {(Object.keys(GROUP_BY_LABEL) as GroupByKey[]).map((key) => {
                  const Icon = GROUP_BY_ICON[key];
                  return (
                    <FilterPill key={key} active={groupBy === key} onClick={() => setGroupBy(key)}>
                      <Icon size={14} />
                      {GROUP_BY_LABEL[key]}
                    </FilterPill>
                  );
                })}
              </FilterGroup>
            </OptionRow>

            <SortOptionRow labels={SORT_LABEL} icons={SORT_ICON} value={sort} onChange={setSort} />

            <SelectFilterRow
              label="Recurrence"
              options={RECURRENCE_OPTIONS}
              value={recurrence}
              onSelect={(value) => { setRecurrence(value); setPage(1); }}
            />

            {/* Instances carry no department of their own — matches "at least one assignee is in
                this department" server-side, same derivation the MANAGER approval scope uses. */}
            {departmentOptions.length > 1 && (
              <SelectFilterRow
                label="Department"
                options={departmentOptions}
                value={departmentId}
                onSelect={(value) => { setDepartmentId(value); setPage(1); }}
              />
            )}

            {/* Verification only applies once every item in an instance is done — the quick-stat
                tiles above already cover completion itself, so this is the one facet they don't:
                whether a completed run has been approved yet. */}
            <SelectFilterRow
              label="Verification"
              options={VERIFICATION_OPTIONS}
              value={verificationStatus}
              onSelect={(value) => { setVerificationStatus(value); setPage(1); }}
            />

            {/* Who this shares each checklist with, not who's assigned it — every row here is
                already yours. Narrows to instances a specific co-assignee is also on. */}
            {!!people.length && (
              <PeopleFilterRow
                label="Assigned with"
                people={people}
                selected={assigneeIds}
                onChange={setAssigneeIds}
              />
            )}
          </OptionsDialog>
        </div>
      </div>

      {isPending && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      )}

      {isError && (
        <div role="alert" className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-danger/20 bg-danger/10 text-danger text-sm font-display">
          <AlertCircle size={18} className="shrink-0" />
          <span className="flex-1">Failed to load your checklists. Please check your connection and try again.</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="shrink-0 px-3 py-1.5 rounded-md text-xs font-display font-semibold border border-danger/30 hover:bg-danger/10 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
          >
            Retry
          </button>
        </div>
      )}

      {!isPending && !isError && instances.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-14 px-6 rounded-xl border border-dashed border-border/70 bg-surface/30 text-center">
          <span className="flex items-center justify-center size-12 rounded-lg bg-surface-hover text-text-muted border border-border">
            <ClipboardCheck size={20} strokeWidth={2.25} />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-display font-bold text-text">
              {quickFilter ? `No checklists match "${QUICK_FILTER_LABEL[quickFilter]}"`
                : storeId ? 'No checklists for this store'
                : departmentId ? 'No checklists shared with this department'
                : assigneeIds.length ? 'No checklists shared with them'
                : 'No checklists assigned to you yet'}
            </p>
            <p className="text-xs font-display text-text-muted max-w-xs">
              {quickFilter || storeId || departmentId || assigneeIds.length ? 'Try clearing the filter to see all your checklists.' : "Once you're assigned a recurring checklist, it will show up here."}
            </p>
          </div>
        </div>
      )}

      {!isPending && !isError && instances.length > 0 && view === 'list' && (
        <div className="flex flex-col gap-6">
          {[...grouped.entries()].map(([groupLabel, group]) => (
            <div key={groupLabel} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-display font-bold text-text">
                  {groupLabel}
                </h3>
                <Badge variant="neutral">{group.length}</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.map(instance => <ChecklistInstanceCard key={instance.id} instance={instance} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isPending && !isError && instances.length > 0 && view === 'board' && (
        <ChecklistInstanceBoard instances={instances} />
      )}

      {!isPending && !isError && instances.length > 0 && view === 'table' && (
        <ChecklistInstanceTable instances={instances} storeNameById={storeNameById} peopleNameById={peopleNameById} />
      )}

      {!isPending && !isError && totalPages > 1 && (
        <PageNav page={page} totalPages={totalPages} onPageChange={setPage} />
      )}
    </div>
  );
};
