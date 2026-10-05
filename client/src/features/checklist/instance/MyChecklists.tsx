import { useCallback, useMemo, useState } from 'react';
import { AlertCircle, ClipboardCheck, X, Store, ChevronRight, Clock, AlarmClock, ArrowDownAZ, Repeat, User, LayoutList, Table2, Kanban, Rows3, ArrowUpDown, Building2, ShieldCheck, Users } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { Skeleton, PageNav, ViewToggle, EmptyState, FilterPill, InlineError, PANEL_CLASS, type ViewTab } from '../../../components';
import {
  OptionsSheet, OptionSection, OptionSegmented, OptionSelect, ChoiceChip, ChoiceIcon, ChoiceWrap, ChoiceClear,
} from '../../../components/optionsSheet';
import { avatarColorClass } from '../../../lib/avatarColors';
import { getInitials } from '../../../lib/getInitials';
import { toggleValue } from '../../../lib/toggleValue';
import { useMediaQuery } from '../../../lib/useMediaQuery';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '../../../context/AuthContext';
import { OWN_SCOPE_ROLES } from '../../../api/auth';
import { useMyChecklistInstancesQuery, useChecklistInstanceSummaryQuery, useAssignableUsersQuery, useDepartmentsQuery } from '../hook';
import { useStoresQuery } from '../../tickets/hook';
import { toFilterPeople } from '../../../lib/filterPeople';
import { ChecklistInstanceCard } from './ChecklistInstanceCard';
import { ChecklistInstanceTable } from './ChecklistInstanceTable';
import { ChecklistInstanceBoard } from './ChecklistInstanceBoard';
import { MyChecklistsQuickStats, type MyChecklistsQuickFilterKey, type MyChecklistsQuickFilterCounts } from './MyChecklistsQuickStats';
import { RECURRENCE_LABEL, VERIFICATION_STATUS_LABEL, VERIFICATION_CHIP, todayPeriodBoundIso } from '../checklistDisplay';
import type { ChecklistInstance, ChecklistInstanceStatus, ChecklistVerificationStatus } from '../../../api/checklistInstances';
import type { ChecklistRecurrence } from '../../../api/checklistDefinitions';

type View = 'list' | 'board' | 'table';
const VIEW_TABS: ViewTab<View>[] = [
  { key: 'list', label: 'List', icon: LayoutList },
  { key: 'board', label: 'Board', icon: Kanban },
  { key: 'table', label: 'Table', icon: Table2, mobileHidden: true },
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

const RECURRENCES = Object.keys(RECURRENCE_LABEL) as ChecklistRecurrence[];
const VERIFICATIONS = Object.keys(VERIFICATION_STATUS_LABEL) as ChecklistVerificationStatus[];

// Same Pending/Due/Completed/Overdue split Delegation and Tickets both use. "Pending" is every
// not-every-item-done instance (overdue included) — mirrors the Dashboard's own KPI strip. "Due"
// is the on-track subset of that (not yet past its period end); "Overdue" is the subset that's run
// past it. These map onto the server's OPEN / DUE / COMPLETED / OVERDUE status filter (see
// `serverStatus` below) rather than being applied here over a fully-downloaded list.

const QUICK_FILTER_LABEL: Record<MyChecklistsQuickFilterKey, string> = {
  pending: 'Pending', completed: 'Completed', due: 'Due', overdue: 'Overdue',
};

const PAGE_SIZE = 50;

// The Table view is hidden below `sm` (its toggle is too), so a phone is always on Board.
const NARROW_QUERY = '(max-width: 639px)';

// Loading placeholders shaped like what replaces them, per view, so nothing jumps on arrival.
const CardSkeleton = () => (
  <div className={cn(PANEL_CLASS, 'flex flex-col gap-2.5 p-3.5')} aria-hidden>
    <div className="flex flex-col gap-1.5">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
    <div className="flex items-center gap-1.5">
      <Skeleton className="h-7 w-20 rounded-full" />
      <Skeleton className="h-7 w-28 rounded-full" />
    </div>
    <div className="flex items-center gap-2.5">
      <Skeleton className="h-1.5 flex-1 rounded-full" />
      <Skeleton className="h-4 w-14" />
    </div>
  </div>
);

const InstancesSkeleton = ({ view }: { view: View }) => {
  if (view === 'board') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {[2, 1, 1].map((cards, col) => (
          <div key={col} className="flex flex-col gap-2.5 lg:gap-3 lg:rounded-2xl lg:border lg:border-border/60 lg:p-2.5">
            <div className="flex items-center justify-between gap-2 px-0.5 lg:px-2 lg:py-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-8 rounded-full" />
            </div>
            {Array.from({ length: cards }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ))}
      </div>
    );
  }
  if (view === 'table') {
    return (
      <div className={cn(PANEL_CLASS, 'w-full overflow-hidden')} aria-hidden>
        <div className="bg-primary-800 px-3 py-3"><Skeleton className="h-4 w-24 bg-white/20" /></div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-3 py-2.5 border-b border-border/40 last:border-b-0">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-28 rounded-full hidden md:block" />
            <Skeleton className="h-4 w-24 hidden lg:block" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
    </div>
  );
};

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
  const { data: stores, isLoading: storesLoading } = useStoresQuery();
  const storeOptions = useMemo(() => (stores ?? []).filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.name })), [stores]);
  const storeNameById = useMemo(() => new Map(storeOptions.map((s) => [s.id, s.name])), [storeOptions]);

  // Board first: it groups by status (Due/Overdue/Completed) at a glance, which is what actually
  // matters day to day — List's default grouping (Recurrence) says nothing about urgency, and
  // Table is denser but built for scanning many rows, not spotting what's overdue right now.
  // The toggle that would switch this back is hidden below `sm`: if someone picked List/Table on a
  // wider screen and then narrows the window past that breakpoint, they get Board rather than a
  // view they can no longer reach the control for. Derived, so there's no effect and no flash.
  const [pickedView, setView] = useState<View>('board');
  const isNarrow = useMediaQuery(NARROW_QUERY);
  const view: View = isNarrow ? 'board' : pickedView;
  const [sort, setSort] = useState<SortKey>('recent');
  const [groupBy, setGroupBy] = useState<GroupByKey>('recurrence');
  const [recurrence, setRecurrence] = useState<ChecklistRecurrence | ''>('');
  const [verificationStatus, setVerificationStatus] = useState<ChecklistVerificationStatus | ''>('');
  // Instances have no departmentId of their own — this matches "at least one assignee belongs to
  // this department" server-side (see checklistInstance.service.ts's instanceIdsForDepartment).
  const [departmentId, setDepartmentId] = useState('');
  const { data: allDepartments } = useDepartmentsQuery();
  const departmentOptions = useMemo(() => (allDepartments ?? []).filter((d) => d.isActive), [allDepartments]);
  // Who else an instance is shared with — checklist instances can carry more than one assignee
  // (e.g. "Store Opening Walkthrough"), so among *your* checklists this narrows to the ones a
  // specific co-assignee is also on. Resolved server-side (getMine/summary's own `assigneeIds`
  // param) — it used to filter only the already-fetched page client-side, which left the quick-
  // stat tiles and pagination total quoting the pre-filter counts while the visible list shrank.
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [showOptions, setShowOptions] = useState(false);

  // Front-line staff see only their own checklists, so the "Shared with" people list and the
  // Department filter are left out for them — the list of colleagues isn't even requested.
  const { user } = useAuth();
  const ownScopeOnly = !!user && OWN_SCOPE_ROLES.includes(user.role);
  const { data: assignableUsers, isLoading: peopleLoading } = useAssignableUsersQuery(undefined, undefined, undefined, !ownScopeOnly);
  const people = useMemo(() => toFilterPeople(assignableUsers), [assignableUsers]);
  const peopleNameById = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);

  // Today's bound (org-local calendar day) — only applied when the Completed filter is actually
  // engaged, below, so the "Completed" tile and this list agree on what "completed" means.
  const todayBound = todayPeriodBoundIso();
  const instanceFilter = {
    status: serverStatus,
    storeId: storeId || undefined,
    recurrence: recurrence || undefined,
    verificationStatus: verificationStatus || undefined,
    departmentId: departmentId || undefined,
    assigneeIds: assigneeIds.length ? assigneeIds : undefined,
    from: serverStatus === 'COMPLETED' ? todayBound : undefined,
    to: serverStatus === 'COMPLETED' ? todayBound : undefined,
  };
  // `isPending` is only true when there is no data at all (keepPreviousData holds the last page
  // while a new filter loads), so skeletons show on first load and the list just dims after that.
  const { data: allInstances = [], isPending, isError, isPlaceholderData, refetch } = useMyChecklistInstancesQuery(instanceFilter, { page, limit: PAGE_SIZE });

  const activeOptionsCount = (storeId ? 1 : 0) + (recurrence ? 1 : 0) + (verificationStatus ? 1 : 0) + (departmentId ? 1 : 0) + (assigneeIds.length > 0 ? 1 : 0);

  const changeStore = (id: string) => {
    setStoreId(id);
    setPage(1);
    setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('store'); return p; });
  };
  const clearOptions = () => { setSort('recent'); setRecurrence(''); setVerificationStatus(''); setDepartmentId(''); setAssigneeIds([]); setPage(1); changeStore(''); };

  const toggleQuickFilter = useCallback((key: MyChecklistsQuickFilterKey) => {
    setQuickFilter((prev) => (prev === key ? null : key));
    // Page 4 of the old filter is meaningless against the new one, and usually past its end.
    setPage(1);
    setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('status'); return p; });
  }, [setSearchParams]);
  const clearQuickFilter = useCallback(() => setQuickFilter(null), []);

  // Everything the empty state can undo in one go: the status tile and every option.
  const clearAllFilters = () => { clearOptions(); setQuickFilter(null); };

  // From the database, not from `allInstances.length`. Counting the fetched array is what forced
  // /mine to return every instance ever assigned; with the tiles independent of the list, the list
  // can page later without the numbers above it quietly turning into page sizes. Also scoped by
  // `storeId` so the tile counts and pagination total match the filtered list, not the whole roster.
  const { data: summary, isPending: summaryIsPending } = useChecklistInstanceSummaryQuery({
    mine: true,
    storeId: storeId || undefined,
    recurrence: recurrence || undefined,
    verificationStatus: verificationStatus || undefined,
    departmentId: departmentId || undefined,
    assigneeIds: assigneeIds.length ? assigneeIds : undefined,
  });
  // Pending/Due/Overdue only ever make sense all-time — a weekly or monthly checklist stays open
  // for its whole period, not just the day it was generated, so a date bound here would make a
  // still-open checklist vanish from your own list most days of the week. Completed is the one
  // number that's safe (and better) to reset daily: an all-time "completed" count only ever
  // climbs for a recurring checklist, so it stops meaning anything as a "your day" number.
  const { data: todaySummary, isPending: todaySummaryIsPending } = useChecklistInstanceSummaryQuery({
    mine: true,
    storeId: storeId || undefined,
    recurrence: recurrence || undefined,
    verificationStatus: verificationStatus || undefined,
    departmentId: departmentId || undefined,
    assigneeIds: assigneeIds.length ? assigneeIds : undefined,
    from: todayBound,
    to: todayBound,
  });
  // The counts default to 0 until the summaries land; the tiles and the overdue banner wait for them
  // rather than showing (or hiding) numbers that aren't true yet.
  const summaryPending = summaryIsPending || todaySummaryIsPending;
  const counts = useMemo<MyChecklistsQuickFilterCounts>(() => ({
    pending: summary?.pending ?? 0,
    completed: todaySummary?.completed ?? 0,
    due: summary?.due ?? 0,
    overdue: summary?.overdue ?? 0,
  }), [summary, todaySummary]);

  // assigneeIds narrowing now happens server-side (both here and in the summary query above), so
  // this only needs to re-sort the page the server already scoped.
  const sortedInstances = useMemo(() => [...allInstances].sort(SORT_COMPARATORS[sort]), [allInstances, sort]);

  // A missed daily/weekly checklist used to pile up as one card per missed period — miss three
  // days and you got three separate "Store Opening Walkthrough" cards, all still overdue. Only the
  // newest period per (definition, store) actually needs to be *worked on*; the older ones are the
  // exact same task that's still open, not a distinct piece of work. This only trims what's
  // rendered here — the summary counts above (and the overdue banner/notifications) still come
  // from `useChecklistInstanceSummaryQuery`, which counts every real instance untouched, so a
  // three-days-overdue checklist still reads as overdue everywhere else, it just isn't shown as
  // three redundant cards on this one page.
  const instances = useMemo(() => {
    const latestByChecklist = new Map<string, ChecklistInstance>();
    for (const instance of sortedInstances) {
      const key = `${instance.definitionId}:${instance.storeId ?? ''}`;
      const current = latestByChecklist.get(key);
      if (!current || new Date(instance.periodStart).getTime() > new Date(current.periodStart).getTime()) {
        latestByChecklist.set(key, instance);
      }
    }
    // Order follows sortedInstances' own order (recent/dueSoonest/titleAsc), not insertion order —
    // Map preserves insertion order, which is whatever order the first-seen instance of each
    // checklist happened to appear in, not the sort the viewer picked.
    const kept = new Set(latestByChecklist.values());
    return sortedInstances.filter((instance) => kept.has(instance));
  }, [sortedInstances]);

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
  // one of its assignees as a real group membership, not just one. While stores/people are still
  // loading, an unresolved name reads "Loading" instead of a wrong "Unknown".
  const grouped = useMemo(() => {
    if (view !== 'list') return [];
    const groups = new Map<string, ChecklistInstance[]>();
    const addTo = (key: string, instance: ChecklistInstance) => {
      const group = groups.get(key);
      if (group) group.push(instance); else groups.set(key, [instance]);
    };
    for (const instance of instances) {
      if (groupBy === 'person') {
        if (!instance.assigneeIds.length) addTo('Unassigned', instance);
        else for (const id of instance.assigneeIds) addTo(peopleNameById.get(id) ?? (peopleLoading ? 'Loading people' : 'Unknown'), instance);
      } else if (groupBy === 'store') {
        addTo(instance.storeId ? (storeNameById.get(instance.storeId) ?? (storesLoading ? 'Loading stores' : 'Unknown store')) : 'No store', instance);
      } else {
        addTo(RECURRENCE_LABEL[instance.recurrence], instance);
      }
    }
    return [...groups.entries()];
  }, [view, instances, groupBy, peopleNameById, storeNameById, peopleLoading, storesLoading]);

  const hasActiveFilters = !!quickFilter || activeOptionsCount > 0;
  // Showing the previous page while the next one loads: keep it, but make it read as stale.
  const refreshing = isPlaceholderData;

  return (
    // Same shared container as Delegation, Tickets and To-Do, centred. Moving between those pages
    // and this one must not shift the content's width or edge.
    <div className="flex flex-col gap-6 mx-auto w-full max-w-(--container-width)">
      <div className="flex flex-col gap-3">
        {/* Same header treatment as Delegation, Tickets and To-Do: no visible title block, the nav
            item that got you here already says My Checklists. The heading stays as the page's one
            accessibility landmark; the count that used to sit in a lead "Total" tile is now this
            plain today-scoped line instead (see MyChecklistsQuickStats' `total` prop comment). */}
        <h1 className="sr-only">My Checklists</h1>
        <div className="flex items-center gap-1.5 text-sm font-display text-text-muted">
          {todaySummary ? <span className="font-semibold text-text tabular-nums">{todaySummary.total}</span> : <Skeleton className="h-4 w-5" />}
          assigned to you today
        </div>

        {/* Stays up while anything of today's is overdue (past its cutoff, still not filled): one
            step up from the red Overdue tile. Yesterday's misses are not in these counts, a new day
            starts clean. One short line, tap to see them. Held back until the summary has loaded so
            it never flashes in or out on a count that is still the 0 default. */}
        {!summaryPending && counts.overdue > 0 && quickFilter !== 'overdue' && (
          <button
            type="button"
            onClick={() => toggleQuickFilter('overdue')}
            className="w-full flex items-center gap-2.5 pl-2 pr-3 py-2 min-h-11 rounded-2xl border border-danger/25 bg-danger/10 text-left transition-colors duration-150 cursor-pointer hover:bg-danger/15 active:bg-danger/15 outline-none focus-visible:ring-2 focus-visible:ring-danger/40 [-webkit-tap-highlight-color:transparent]"
          >
            <span className="flex items-center justify-center size-8 rounded-full bg-danger text-white shrink-0">
              <AlertCircle size={16} strokeWidth={2.5} aria-hidden />
            </span>
            <span className="flex-1 min-w-0 text-sm font-display font-semibold text-danger">
              {counts.overdue} {counts.overdue === 1 ? 'checklist is' : 'checklists are'} overdue
            </span>
            <span className="flex items-center gap-0.5 text-xs font-display font-semibold text-danger shrink-0">
              View
              <ChevronRight size={15} strokeWidth={2.5} aria-hidden />
            </span>
          </button>
        )}

        <MyChecklistsQuickStats
          counts={counts}
          active={quickFilter}
          onToggle={toggleQuickFilter}
          onClear={clearQuickFilter}
          isLoading={summaryPending}
        />
      </div>

      {/* Same "Store scope box + Options button" pair Delegation and Tickets both put in their own
          toolbar row — Store as a permanent, always-visible box (it's the one org-scope dimension
          checklist instances carry), Sort tucked inside Options since it's a view preference, not
          a narrowing filter. */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* View lives in the toolbar, not inside Options — same as Delegation/Tickets: it changes
            what the whole page looks like, so it reads as a place you are, not a setting. Hidden
            below `sm` entirely, not just Table — Board (the default) already reorders to
            Overdue-first stacked cards on a phone (see ChecklistInstanceBoard's own comment),
            which is exactly the "just show me the cards, overdue on top" view a mobile user
            wants, so there's nothing worth switching away from there to offer a toggle for. */}
        <div className="hidden sm:block">
          <ViewToggle tabs={VIEW_TABS} value={view} onChange={setView} />
        </div>

        {quickFilter && (
          <FilterPill active icon={X} onClick={clearQuickFilter}>
            <span className="sr-only">Clear status filter: </span>
            Showing: {QUICK_FILTER_LABEL[quickFilter]}
          </FilterPill>
        )}

        {/* `sm:ml-auto`, not a bare `ml-auto` — same fix as Tickets/Tasks: the auto-margin was
            shifting this Store+Options cluster off the left edge on mobile for no benefit,
            since there's no primary action to balance against on this page. Store used to be its
            own dropdown beside Options; it's a filter like the rest, so it lives in the sheet now
            and the toolbar is just Options, same as the other list pages. */}
        <div className="flex items-center gap-2.5 shrink-0 sm:ml-auto">
          <OptionsSheet
            isOpen={showOptions}
            setIsOpen={setShowOptions}
            activeCount={activeOptionsCount}
            subtitle={summary ? `${instances.length} of ${summary.total} checklists` : `${instances.length} checklists`}
            onReset={clearOptions}
            canReset={activeOptionsCount > 0 || sort !== 'recent'}
            showLabel={`Show ${instances.length} ${instances.length === 1 ? 'checklist' : 'checklists'}`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {view === 'list' && (
                <OptionSection icon={Rows3} label="Group by">
                  <OptionSegmented
                    options={(Object.keys(GROUP_BY_LABEL) as GroupByKey[]).map((k) => ({ value: k, label: GROUP_BY_LABEL[k], icon: GROUP_BY_ICON[k] }))}
                    value={groupBy}
                    onChange={setGroupBy}
                  />
                </OptionSection>
              )}
              <OptionSection icon={ArrowUpDown} label="Sort by">
                <OptionSelect labels={SORT_LABEL} icons={SORT_ICON} value={sort} onChange={setSort} />
              </OptionSection>
            </div>

            {storeOptions.length > 1 && (
              <OptionSection icon={Store} label="Store" aside={!!storeId && <ChoiceClear onClick={() => changeStore('')} />}>
                <ChoiceWrap>
                  {storeOptions.map((o) => (
                    <ChoiceChip
                      key={o.id}
                      active={storeId === o.id}
                      onClick={() => changeStore(storeId === o.id ? '' : o.id)}
                      lead={<ChoiceIcon icon={Store} tone="bg-primary-600" />}
                    >
                      {o.name}
                    </ChoiceChip>
                  ))}
                </ChoiceWrap>
              </OptionSection>
            )}

            <OptionSection icon={Repeat} label="How often" aside={!!recurrence && <ChoiceClear onClick={() => { setRecurrence(''); setPage(1); }} />}>
              <ChoiceWrap>
                {RECURRENCES.map((r) => (
                  <ChoiceChip
                    key={r}
                    active={recurrence === r}
                    onClick={() => { setRecurrence(recurrence === r ? '' : r); setPage(1); }}
                    lead={<ChoiceIcon icon={Repeat} tone="bg-primary-700" />}
                  >
                    {RECURRENCE_LABEL[r]}
                  </ChoiceChip>
                ))}
              </ChoiceWrap>
            </OptionSection>

            {/* Approval only applies once every item is done; the tiles above already cover
                completion itself. */}
            <OptionSection icon={ShieldCheck} label="Approval" aside={!!verificationStatus && <ChoiceClear onClick={() => { setVerificationStatus(''); setPage(1); }} />}>
              <ChoiceWrap>
                {VERIFICATIONS.map((v) => (
                  <ChoiceChip
                    key={v}
                    active={verificationStatus === v}
                    onClick={() => { setVerificationStatus(verificationStatus === v ? '' : v); setPage(1); }}
                    lead={<ChoiceIcon icon={VERIFICATION_CHIP[v].icon} tone={VERIFICATION_CHIP[v].tone} />}
                  >
                    {VERIFICATION_STATUS_LABEL[v]}
                  </ChoiceChip>
                ))}
              </ChoiceWrap>
            </OptionSection>

            {/* Instances carry no department of their own: this matches "at least one assignee is
                in this department" server-side. */}
            {!ownScopeOnly && departmentOptions.length > 0 && (
              <OptionSection icon={Building2} label="Department" aside={!!departmentId && <ChoiceClear onClick={() => { setDepartmentId(''); setPage(1); }} />}>
                <ChoiceWrap>
                  {departmentOptions.map((d) => (
                    <ChoiceChip
                      key={d.id}
                      active={departmentId === d.id}
                      onClick={() => { setDepartmentId(departmentId === d.id ? '' : d.id); setPage(1); }}
                      lead={<ChoiceIcon icon={Building2} tone="bg-primary-600" />}
                    >
                      {d.name}
                    </ChoiceChip>
                  ))}
                </ChoiceWrap>
              </OptionSection>
            )}

            {!!people.length && (
              <OptionSection icon={Users} label="Shared with" aside={assigneeIds.length > 0 && <ChoiceClear onClick={() => { setAssigneeIds([]); setPage(1); }} />}>
                <ChoiceWrap>
                  {people.map((p) => (
                    <ChoiceChip
                      key={p.id}
                      active={assigneeIds.includes(p.id)}
                      onClick={() => { setAssigneeIds(toggleValue(assigneeIds, p.id)); setPage(1); }}
                      lead={
                        <span className={`flex items-center justify-center size-6 rounded-full text-white text-[9px] font-bold shrink-0 ${avatarColorClass(p.name)}`}>
                          {getInitials(p.name)}
                        </span>
                      }
                    >
                      {p.name.split(' ')[0]}
                    </ChoiceChip>
                  ))}
                </ChoiceWrap>
              </OptionSection>
            )}
          </OptionsSheet>
        </div>
      </div>

      <div className={cn('flex flex-col gap-6 transition-opacity duration-200', refreshing && 'opacity-60')}>
        {isPending && <InstancesSkeleton view={view} />}

        {isError && (
          <InlineError message="We couldn't load your checklists. Check your connection and try again." onRetry={() => refetch()} />
        )}

        {!isPending && !isError && instances.length === 0 && (
          <EmptyState
            icon={ClipboardCheck}
            title={quickFilter ? `No checklists match "${QUICK_FILTER_LABEL[quickFilter]}"`
              : storeId ? 'No checklists for this store'
              : departmentId ? 'No checklists shared with this department'
              : assigneeIds.length ? 'No checklists shared with this person'
              : 'No checklists assigned to you yet'}
            description={hasActiveFilters ? 'Try clearing the filter to see all your checklists.' : "Once you're assigned a recurring checklist, it will show up here."}
            action={hasActiveFilters ? { label: 'Clear filters', onClick: clearAllFilters } : undefined}
          />
        )}

        {!isPending && !isError && instances.length > 0 && view === 'list' && (
          <div className="flex flex-col gap-6">
            {grouped.map(([groupLabel, group]) => (
              <section key={groupLabel} aria-label={groupLabel} className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs font-display font-bold text-text">
                    {groupLabel}
                  </h2>
                  <Badge variant="neutral">{group.length}</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.map(instance => <ChecklistInstanceCard key={instance.id} instance={instance} />)}
                </div>
              </section>
            ))}
          </div>
        )}

        {!isPending && !isError && instances.length > 0 && view === 'board' && (
          <ChecklistInstanceBoard instances={instances} />
        )}

        {!isPending && !isError && instances.length > 0 && view === 'table' && (
          <ChecklistInstanceTable
            instances={instances}
            storeNameById={storeNameById}
            peopleNameById={peopleNameById}
            lookupsPending={storesLoading || peopleLoading}
          />
        )}

        {!isPending && !isError && totalPages > 1 && (
          <PageNav page={page} totalPages={totalPages} onPageChange={setPage} />
        )}
      </div>
    </div>
  );
};
