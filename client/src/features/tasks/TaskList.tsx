import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { Wand2, AlertCircle, Save, Inbox, X, Plus, ChevronDown, Upload } from "lucide-react";
import { Skeleton, Fab, ViewToggle, EmptyState, type ViewTab } from "../../components";
import { CreatedRangeBanner, CreatedRangePicker } from "../../components/createdRangeBanner";
import { useCreatedRange } from "../../lib/createdRange";
import { ExportDialog } from "../reports";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useTasksQuery, useTasksMetaQuery, useAssignableUsersQuery } from "./hook";
import { useTagsQuery } from "../tags/hook";
import { useDepartmentsQuery, useStoresQuery } from "../tickets/hook";
import type { Task } from '../../api/task';
import { TaskForm } from "./TaskForm";
import { TaskDetail } from "./TaskDetail";
import { TaskBoard } from "./TaskBoard";
import { TaskListView } from "./TaskListView";
import { TaskTable } from "./TaskTable";
import { TaskTimeline } from "./TaskTimeline";
import { TASK_VIEWS, TASK_VIEW_LABEL, TASK_VIEW_ICON, defaultTaskView, isTaskViewKey, type TaskViewKey } from "./taskViews";
import { useIsMobile } from "../../lib/useMediaQuery";
import { SmartTaskModal } from "./SmartTaskModal";
import { TaskBulkImportModal } from "./bulkImport/TaskBulkImportModal";
import { TaskOptionsDialog, type TaskScopeKey } from "./TaskOptionsDialog";
import { PhoneScopeSwitch } from "../../components/phoneScopeSwitch/PhoneScopeSwitch";
import { TaskQuickStats, type QuickFilterKey } from "./TaskQuickStats";
import { type BoardGroupBy } from "./taskBoardGroups";
import { CATEGORY_PREDICATES, SORT_COMPARATORS, isOverdueTask, type CategoryFilterKey, type TaskSortKey, type TaskFilters } from "./taskFilters";
import { STATUS_LABEL, PRIORITY_MAP } from "./taskDisplay";
import { useCardFieldVisibility, taskAssigneeIds } from "./cardFields";
import { useAuth } from "../../context/AuthContext";
import { OWN_SCOPE_ROLES } from "../../api/auth";
import { useNotificationsQuery, useMarkNotificationReadMutation } from "../notifications/hooks";
import { readQuickFilterParam } from "../../lib/readQuickFilterParam";

const QUICK_FILTER_VALUES = ["pending", "completed", "due", "delayed"] as const;

// Module scope so the array is referentially stable — ViewToggle is a plain component but the
// controls band re-renders on every filter keystroke, and rebuilding this per render is the same
// wasted work as TicketList's `new Map(departments)`.
const VIEW_TABS: ViewTab<TaskViewKey>[] = TASK_VIEWS.map((key) => ({
  key,
  label: TASK_VIEW_LABEL[key],
  icon: TASK_VIEW_ICON[key],
  // Table/Timeline are dense, many-column layouts that need real width — hidden below `sm`,
  // same as Tickets' own view toggle. Board and List stay available at every size.
  // Phones get the card list only — Board's columns run off the screen edge, and Table/Timeline
  // need width a phone doesn't have. ViewToggle falls back to List if one of these is active.
  mobileHidden: key !== 'list',
}));

interface TaskListProps {
  userId?: string;
  hideHeader?: boolean;
  /** Locks the page to exactly one category bucket (Smart Delegations' AI-only view uses
   *  'delegation', which CATEGORY_PREDICATES already defines as "delegation category + aiMeta
   *  present" — i.e. actually created through the AI, not just typed into the New Task form).
   *  With this set: the Category row disappears from Options (nothing left to pick), the URL
   *  never carries `category=`, "Clear all filters" can't wipe it back to All, and it isn't
   *  listed as an active-filter chip since it was never a filter the viewer applied. */
  lockCategory?: CategoryFilterKey;
  /** Overrides the sr-only page title and empty-state copy for a locked page. */
  title?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}

const QUICK_FILTER_PREDICATES: Record<QuickFilterKey, (t: Task) => boolean> = {
  pending: (t) => t.status !== 'done',
  completed: (t) => t.status === 'done',
  due: (t) => !!t.dueDate && t.status !== 'done' && !isOverdueTask(t),
  delayed: isOverdueTask,
};

const DEFAULT_FILTERS: TaskFilters = { category: 'all', status: 'all', priority: [], storeId: '', departmentId: '', assigneeIds: [], raisedByIds: [], tagIds: [] };

const URL_TRACKED_DEFAULTS: Pick<TaskFilters, 'category' | 'status' | 'storeId' | 'departmentId' | 'assigneeIds' | 'raisedByIds' | 'tagIds'> = {
  category: 'all', status: 'all', storeId: '', departmentId: '', assigneeIds: [], raisedByIds: [], tagIds: [],
};

const filtersFromUrl = (searchParams: URLSearchParams): Partial<TaskFilters> => {
  const fromUrl: Partial<TaskFilters> = {};
  const category = searchParams.get('category');
  const status = searchParams.get('status');
  const storeId = searchParams.get('storeId');
  const departmentId = searchParams.get('departmentId');
  const assigneeIds = searchParams.get('assigneeIds');
  const raisedByIds = searchParams.get('raisedByIds');
  if (category) fromUrl.category = category as CategoryFilterKey;
  if (status) fromUrl.status = status as Task['status'];
  if (storeId) fromUrl.storeId = storeId;
  if (departmentId) fromUrl.departmentId = departmentId;
  if (assigneeIds) fromUrl.assigneeIds = assigneeIds.split(',');
  if (raisedByIds) fromUrl.raisedByIds = raisedByIds.split(',');
  const tagIds = searchParams.get('tagIds');
  if (tagIds) fromUrl.tagIds = tagIds.split(',');
  return fromUrl;
};

// `lockCategory` scopes the key too — otherwise Smart Delegations (locked to `category:
// 'delegation'`) and the main Delegation page would read and write the exact same
// `task-filters:<userId>` entry. Category gets forced back regardless (see `withLock` below), but
// "Save view" on the locked page would otherwise silently overwrite the main page's saved status/
// priority/etc. the next time it loads there too.
const filtersStorageKey = (userId?: string, lockCategory?: CategoryFilterKey) =>
  `task-filters:${userId ?? 'anon'}${lockCategory ? `:${lockCategory}` : ''}`;

export const TaskList = ({ userId, hideHeader = false, lockCategory, title, emptyTitle, emptyDescription }: TaskListProps = {}) => {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const isVerifier = user?.role === "PC" || user?.role === "ADMIN";
  const ownScopeOnly = !!user && OWN_SCOPE_ROLES.includes(user.role);
  const [searchParams, setSearchParams] = useSearchParams();
  const [showSmartModal, setShowSmartModal] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [selected, setSelected] = useState<{ task: Task; mode: 'view' | 'edit' } | null>(null);

  // Pins `category` to `lockCategory` no matter what the URL, localStorage, or a stray
  // `updateFilters` patch says — the one thing that makes a locked page locked.
  const withLock = useCallback(
    (f: TaskFilters): TaskFilters => (lockCategory ? { ...f, category: lockCategory } : f),
    [lockCategory],
  );

  // Declared before the queries below because one of these filters — tagIds — is applied by the
  // server, so it feeds the tasks request and its cache key rather than filtering the result.
  const [filters, setFilters] = useState<TaskFilters>(() => {
    const fromUrl = filtersFromUrl(searchParams);
    if (Object.keys(fromUrl).length) return withLock({ ...DEFAULT_FILTERS, ...fromUrl });

    try {
      const raw = localStorage.getItem(filtersStorageKey(user?.id, lockCategory));
      if (raw) {
        const saved = JSON.parse(raw);
        if (!Array.isArray(saved.priority)) delete saved.priority;
        if (!Array.isArray(saved.assigneeIds)) delete saved.assigneeIds;
        if (!Array.isArray(saved.raisedByIds)) delete saved.raisedByIds;
        if (!Array.isArray(saved.tagIds)) delete saved.tagIds;
        return withLock({ ...DEFAULT_FILTERS, ...saved });
      }
    } catch {
      // Corrupt/unavailable localStorage
    }
    return withLock(DEFAULT_FILTERS);
  });

  const { data: tasks, isPending, isError } = useTasksQuery(userId, true, filters.tagIds);
  // Shares useTasksQuery's cache entry — no extra request. Every other count on this page is
  // derived client-side from the fetched array, so when the server has more rows than one page
  // holds those counts describe the page, not the org; `meta.total` is what makes that visible.
  const { data: listMeta } = useTasksMetaQuery(userId, true, filters.tagIds);
  const { data: tags } = useTagsQuery();
  const { data: assignableUsers } = useAssignableUsersQuery();
  const { data: departments } = useDepartmentsQuery();
  const { data: stores } = useStoresQuery();
  const { data: notifications } = useNotificationsQuery();
  const markNotificationRead = useMarkNotificationReadMutation();

  const unreadAssignmentByTaskId = useMemo(
    () => new Map(
      (notifications ?? [])
        .filter(n => n.type === 'TASK_ASSIGNED' && !n.isRead && n.taskId)
        .map(n => [n.taskId as string, n.id]),
    ),
    [notifications],
  );

  const newlyAssignedTaskIds = useMemo(
    () => new Set(unreadAssignmentByTaskId.keys()),
    [unreadAssignmentByTaskId],
  );

  const openCreateForm = useCallback(() => setShowForm(true), []);

  const handleOpen = useCallback((task: Task, mode: 'view' | 'edit' = 'view') => {
    setSelected({ task, mode });
    const notificationId = unreadAssignmentByTaskId.get(task.id);
    if (notificationId) markNotificationRead.mutate(notificationId);
    // markNotificationRead is a stable mutation object from React Query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadAssignmentByTaskId]);

  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || !tasks) return;
    const match = tasks.find(t => t.id === openId);
    // Syncing from an external system (the URL, set by a notification click elsewhere) into local
    // state, not reacting to React state — and the param is stripped right after, so this only
    // ever fires once per navigation instead of looping.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (match) handleOpen(match);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('open');
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, tasks]);

  // Same one-shot-param pattern as `open` above — the sidebar's "+" quick-create link has no
  // route of its own to land on (SmartTaskModal opens from local state, not a route), so it deep-
  // links here instead and this effect is what actually opens the modal on arrival.
  useEffect(() => {
    if (!searchParams.get('create')) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowSmartModal(true);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('create');
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const isFirstFiltersRun = useRef(true);
  useEffect(() => {
    if (isFirstFiltersRun.current) {
      isFirstFiltersRun.current = false;
      return;
    }
    setFilters(prev => withLock({ ...prev, ...URL_TRACKED_DEFAULTS, ...filtersFromUrl(searchParams) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const [sort, setSort] = useState<TaskSortKey>('dueDate');
  const [boardGroupBy, setBoardGroupBy] = useState<BoardGroupBy>('status');

  // Which layout renders the list. Read from ?view= first so a shared or bookmarked link opens in
  // the view it was sent in, exactly like the filters above; otherwise the per-viewport default.
  const [view, setView] = useState<TaskViewKey>(() => {
    const fromUrl = searchParams.get('view');
    return isTaskViewKey(fromUrl) ? fromUrl : defaultTaskView(isMobile);
  });

  const changeView = (next: TaskViewKey) => {
    setView(next);
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      // The viewport default isn't worth a URL param — leaving it out keeps a plain /tasks link
      // adapting to whatever device opens it.
      if (next === defaultTaskView(isMobile)) params.delete('view');
      else params.set('view', next);
      return params;
    }, { replace: true });
  };

  const [quickFilter, setQuickFilter] = useState<QuickFilterKey | null>(
    () => readQuickFilterParam(searchParams, QUICK_FILTER_VALUES),
  );

  const { visibility: fieldVisibility, toggle: toggleField } = useCardFieldVisibility();

  const syncFiltersToUrl = (next: TaskFilters) => {
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      // A locked page never carries `category=` in its URL at all — there's nothing to bookmark
      // or share differently, since every visit to this route is already scoped to it.
      if (lockCategory) {
        params.delete('category');
      } else if (next.category !== 'all') params.set('category', next.category); else params.delete('category');
      if (next.status !== 'all') params.set('status', next.status); else params.delete('status');
      if (next.storeId) params.set('storeId', next.storeId); else params.delete('storeId');
      if (next.departmentId) params.set('departmentId', next.departmentId); else params.delete('departmentId');
      if (next.assigneeIds.length) params.set('assigneeIds', next.assigneeIds.join(',')); else params.delete('assigneeIds');
      if (next.raisedByIds.length) params.set('raisedByIds', next.raisedByIds.join(',')); else params.delete('raisedByIds');
      if (next.tagIds.length) params.set('tagIds', next.tagIds.join(',')); else params.delete('tagIds');
      return params;
    }, { replace: true });
  };

  const persistFiltersIfSaved = (next: TaskFilters) => {
    try {
      const key = filtersStorageKey(user?.id, lockCategory);
      if (localStorage.getItem(key) !== null) {
        localStorage.setItem(key, JSON.stringify(next));
      }
    } catch {
      // Ignore
    }
  };

  // A delegation carries a departmentId, never a storeId — the store is one hop further out, on
  // the department. This is that hop, resolved once instead of per task per render.
  const departmentStoreId = useMemo(
    () => new Map((departments ?? []).map(d => [d.id, d.storeId])),
    [departments],
  );
  const updateFilters = (patch: Partial<TaskFilters>) => {
    const next = withLock({ ...filters, ...patch });
    // Switching store while a department belonging to the OLD store is still selected leaves a
    // filter pair that can never match anything. This lived in the store box's own onSelect while
    // Store was a toolbar control; it belongs here now that the Store row inside Options sets the
    // same field, so the rule holds no matter which control changed it.
    if (patch.storeId !== undefined && next.departmentId && next.storeId
      && departmentStoreId.get(next.departmentId) !== next.storeId) {
      next.departmentId = '';
    }
    setFilters(next);
    syncFiltersToUrl(next);
    persistFiltersIfSaved(next);
  };

  const clearFilters = () => {
    const next = withLock(DEFAULT_FILTERS);
    setFilters(next);
    syncFiltersToUrl(next);
    persistFiltersIfSaved(next);
    setQuickFilter(null);
  };

  const toggleQuickFilter = (key: QuickFilterKey) => {
    setQuickFilter((prev) => (prev === key ? null : key));
  };

  // Quick ownership tabs — tapping the active one again clears back to "everyone", same
  // toggle-off behavior as the quick-stat tiles above.
  const isAssignedToMe = !!user && filters.assigneeIds.length === 1 && filters.assigneeIds[0] === user.id;
  const isAssignedByMe = !!user && filters.raisedByIds.length === 1 && filters.raisedByIds[0] === user.id;
  // Everyone / Assigned to me / Assigned by me: in the Options sheet on bigger screens, as two pills on a phone.
  const scope: { value: TaskScopeKey; onChange: (next: TaskScopeKey) => void } | undefined = !userId && user ? {
    value: isAssignedToMe ? 'mine' : isAssignedByMe ? 'byMe' : 'all',
    // One patch for both fields — updateFilters reads `filters` from this render, so
    // two back-to-back calls would have the second overwrite the first.
    onChange: (next) => updateFilters({
      assigneeIds: next === 'mine' ? [user.id] : isAssignedToMe ? [] : filters.assigneeIds,
      raisedByIds: next === 'byMe' ? [user.id] : isAssignedByMe ? [] : filters.raisedByIds,
    }),
  } : undefined;

  const saveFilters = () => {
    try {
      localStorage.setItem(filtersStorageKey(user?.id, lockCategory), JSON.stringify(filters));
      toast.success('Filter saved');
    } catch {
      toast.error('Could not save filter');
    }
  };

  // Both are passed straight to the board/list; rebuilding them each render gave those children a
  // new prop identity every time and defeated any memoisation downstream.
  const assigneeNames = useMemo(
    () => new Map((assignableUsers ?? []).map(u => [u.id, `${u.firstName} ${u.lastName ?? ''}`.trim()])),
    [assignableUsers],
  );
  const departmentNames = useMemo(
    () => new Map((departments ?? []).map(d => [d.id, d.name])),
    [departments],
  );
  // Only for resolving the active-filter chip's label — the views read each delegation's own
  // `tags` array, which the server already returns with names attached.
  const tagNames = useMemo(
    () => new Map((tags ?? []).map(t => [t.id, t.name])),
    [tags],
  );
  const storeOptions = useMemo(
    () => (stores ?? []).filter(s => s.isActive).map(s => ({ id: s.id, name: s.name })),
    [stores],
  );

  // Narrowed by the store box beside it: with a store picked, the department list is that store's
  // departments only — offering the rest would let you build a combination that can never match.
  const departmentOptions = useMemo(
    () => (departments ?? [])
      .filter(d => d.isActive && (!filters.storeId || d.storeId === filters.storeId))
      .map(d => ({ id: d.id, name: d.name })),
    [departments, filters.storeId],
  );

  const mineOnly = searchParams.get('mine') === '1';
  // Opened from a chart bar: only delegations created inside that bar's period (see lib/createdRange).
  const createdRange = useCreatedRange();
  const mineFiltered = useMemo(() => {
    const everything = tasks ?? [];
    const mine = !mineOnly || !user
      ? everything
      : everything.filter(t => t.userId === user.id || t.assigneeId === user.id || t.additionalAssigneeIds.includes(user.id));
    return createdRange.range ? mine.filter(t => createdRange.matches(t.createdAt)) : mine;
  }, [tasks, mineOnly, user, createdRange]);

  // The store box sits above the stat tiles and scopes the page, so it's applied before the counts
  // are taken — otherwise picking a store would narrow the board while the tiles above it kept
  // reporting company-wide numbers.
  const scopeFiltered = useMemo(
    () => (!filters.storeId
      ? mineFiltered
      : mineFiltered.filter(t => !!t.departmentId && departmentStoreId.get(t.departmentId) === filters.storeId)),
    [mineFiltered, filters.storeId, departmentStoreId],
  );

  // The whole narrowing chain in one memo. Previously these were eight separate array passes run on
  // every render, and — more importantly — each produced a fresh array, so `sorted` below could
  // never be stable and the board re-rendered its entire card grid on any state change at all.
  const filtered = useMemo(() => {
    const categoryFiltered = scopeFiltered.filter(CATEGORY_PREDICATES[filters.category]);
    const priorityFiltered = filters.priority.length === 0 ? categoryFiltered : categoryFiltered.filter(t => filters.priority.includes(t.priority));
    const departmentFiltered = filters.departmentId ? priorityFiltered.filter(t => t.departmentId === filters.departmentId) : priorityFiltered;
    const assigneeFiltered = filters.assigneeIds.length === 0
      ? departmentFiltered
      : departmentFiltered.filter(t => taskAssigneeIds(t).some(id => filters.assigneeIds.includes(id)));
    const raisedByFiltered = filters.raisedByIds.length === 0
      ? assigneeFiltered
      : assigneeFiltered.filter(t => filters.raisedByIds.includes(t.userId));
    const statusFiltered = filters.status === 'all' ? raisedByFiltered : raisedByFiltered.filter(t => t.status === filters.status);
    return quickFilter ? statusFiltered.filter(QUICK_FILTER_PREDICATES[quickFilter]) : statusFiltered;
  }, [scopeFiltered, filters, quickFilter]);

  // Left unmemoised on purpose: "due" vs "delayed" is decided against the clock, so freezing these
  // behind a dependency array would let a tile keep saying "due" after the deadline had passed.
  // Four passes over an already-narrowed array is not what was making this page slow.
  const quickCounts = {
    pending: scopeFiltered.filter(QUICK_FILTER_PREDICATES.pending).length,
    completed: scopeFiltered.filter(QUICK_FILTER_PREDICATES.completed).length,
    due: scopeFiltered.filter(QUICK_FILTER_PREDICATES.due).length,
    delayed: scopeFiltered.filter(QUICK_FILTER_PREDICATES.delayed).length,
  };

  // Copy-and-sort on every render handed the board a new array each time. Memoised on the filtered
  // result and the sort key, so it only changes when one of those actually does.
  const sorted = useMemo(() => [...filtered].sort(SORT_COMPARATORS[sort]), [filtered, sort]);

  const activeChips: { key: string; label: string; onClear: () => void }[] = [
    ...(filters.status !== 'all' ? [{ key: 'status', label: `Status: ${STATUS_LABEL[filters.status]}`, onClear: () => updateFilters({ status: 'all' }) }] : []),
    // Never shown on a locked page — the category there isn't something the viewer chose and
    // can clear, it's what the page is.
    ...(!lockCategory && filters.category !== 'all' ? [{ key: 'category', label: `Category: ${filters.category === 'task' ? 'Direct Task' : filters.category === 'issue' ? 'Issues' : 'Delegations'}`, onClear: () => updateFilters({ category: 'all' }) }] : []),
    ...(filters.priority.length > 0 ? [{
      key: 'priority',
      label: `Priority: ${filters.priority.map(p => PRIORITY_MAP[p].label).join(', ')}`,
      onClear: () => updateFilters({ priority: [] }),
    }] : []),
    // Store and Department DO get chips now. They used to be permanent boxes in the toolbar that
    // stated their own selection, which made a chip a duplicate; as rows inside Options their
    // selection is invisible while the dialog is closed, so the chip is the only thing telling
    // you the page is scoped.
    ...(filters.storeId ? [{
      key: 'storeId',
      label: `Store: ${storeOptions.find(s => s.id === filters.storeId)?.name ?? 'Unknown'}`,
      onClear: () => updateFilters({ storeId: '' }),
    }] : []),
    ...(filters.departmentId ? [{
      key: 'departmentId',
      label: `Department: ${departmentNames.get(filters.departmentId) ?? 'Unknown'}`,
      onClear: () => updateFilters({ departmentId: '' }),
    }] : []),
    ...(filters.assigneeIds.length > 0 ? [{
      key: 'assigneeIds',
      label: filters.assigneeIds.length === 1
        ? `Assignee: ${assigneeNames.get(filters.assigneeIds[0]) ?? 'Unknown'}`
        : `Assignees: ${filters.assigneeIds.length}`,
      onClear: () => updateFilters({ assigneeIds: [] }),
    }] : []),
    ...(filters.raisedByIds.length > 0 ? [{
      key: 'raisedByIds',
      label: filters.raisedByIds.length === 1
        ? `Raised by: ${assigneeNames.get(filters.raisedByIds[0]) ?? 'Unknown'}`
        : `Raised by: ${filters.raisedByIds.length}`,
      onClear: () => updateFilters({ raisedByIds: [] }),
    }] : []),
    ...(filters.tagIds.length > 0 ? [{
      key: 'tagIds',
      // Names, not a count, while there's room — a label filter is only useful if you can see
      // which labels are on.
      label: filters.tagIds.length <= 2
        ? `Labels: ${filters.tagIds.map(id => tagNames.get(id) ?? 'Unknown').join(', ')}`
        : `Labels: ${filters.tagIds.length}`,
      onClear: () => updateFilters({ tagIds: [] }),
    }] : []),
  ];

  // Store and Department are chips now, so they're already counted — adding them again would
  // double-count and show "2" on the Options badge for one selected store.
  const activeCount = activeChips.length;

  const isEmpty = sorted.length === 0;

  // Pulled out of the header markup so the `hideHeader` case (this list embedded in another page,
  // which supplies its own title) can render the same controls without a second copy of them.
  const headerActions = (
    <>
          
            {!userId && (
              <>
                <div className="hidden md:block">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      {/* Solid navy at rest, not the app's quiet primary: this is the page's one
                          create action, and the grey resting state read as disabled next to the
                          navy Total tile above it. Split look: action on the left, a divided
                          chevron on the right saying "more ways to create". */}
                      <button
                        type="button"
                        className="group inline-flex items-center h-9 rounded-full bg-primary-800 hover:bg-primary-900 dark:bg-primary-600 dark:hover:bg-primary-500 text-white text-sm font-display font-semibold tracking-tight ring-1 ring-inset ring-white/10 transition-all duration-200 ease-in-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-[0.98] data-[state=open]:bg-primary-900 dark:data-[state=open]:bg-primary-500"
                      >
                        <span className="flex items-center gap-2 pl-3.5 pr-3">
                          <span className="flex items-center justify-center size-5 rounded-full bg-white/15">
                            <Plus size={13} strokeWidth={3} className="transition-transform duration-300 group-hover:rotate-90" />
                          </span>
                          New Delegation
                        </span>
                        <span className="flex items-center self-stretch pl-2 pr-3 border-l border-white/15">
                          <ChevronDown size={14} strokeWidth={2.5} className="opacity-80 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                        </span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={8} className="w-72 rounded-xl p-1.5">
                      {[
                        { key: 'new', icon: Plus, title: 'New Delegation', hint: 'Assign work with a due date', onClick: () => setShowForm(true), tile: 'bg-primary-600', show: true, soon: false },
                        { key: 'smart', icon: Wand2, title: 'Smart Task', hint: 'Type it in plain words, form fills itself', onClick: () => isVerifier && setShowSmartModal(true), tile: 'bg-warning', show: true, soon: !isVerifier },
                        // Admin/PC only, and absent rather than shown-disabled for anyone else —
                        // a real, ready feature scoped to who may bulk-create for other people.
                        { key: 'bulk', icon: Upload, title: 'Bulk Import', hint: 'Upload a sheet, create many at once', onClick: () => setShowBulkImport(true), tile: 'bg-success', show: isVerifier, soon: false },
                      ].filter((item) => item.show).map(({ key, icon: ItemIcon, title: itemTitle, hint, onClick, tile, soon }) => (
                        <DropdownMenuItem key={key} onClick={onClick} disabled={soon} className="gap-3 px-2 py-2 rounded-lg cursor-pointer">
                          {/* Solid tile + white glyph, same as the icon chips. `!` beats the menu
                              item's own descendant rule that greys every svg inside it. */}
                          <span className={`flex items-center justify-center size-9 rounded-lg shrink-0 ${tile} ${soon ? 'opacity-50' : ''}`}>
                            <ItemIcon size={16} strokeWidth={2.5} className="text-white!" />
                          </span>
                          <span className="flex flex-col min-w-0 flex-1">
                            <span className="text-sm font-display font-semibold text-text">{itemTitle}</span>
                            <span className="text-xs text-text-muted leading-snug">{hint}</span>
                          </span>
                          {soon && (
                            <span className="text-xs font-display font-bold px-1.5 py-0.5 rounded-full bg-surface-hover border border-border text-text-light">
                              Soon
                            </span>
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <Fab
                  actions={[
                    { key: 'new', label: 'New Delegation', icon: Plus, onClick: () => setShowForm(true) },
                    // Verifier-only, like Bulk Import — a disabled entry with a "Soon" badge was a
                    // dead button in every regular user's menu.
                    ...(isVerifier ? [
                      { key: 'smart', label: 'Smart Task', icon: Wand2, onClick: () => setShowSmartModal(true) },
                      { key: 'bulk-import', label: 'Bulk Import', icon: Upload, onClick: () => setShowBulkImport(true) },
                    ] : []),
                  ]}
                />
              </>
            )}

      
            <div className="hidden sm:contents">
            <TaskOptionsDialog
              isOpen={showOptions}
              setIsOpen={setShowOptions}
              filters={filters}
              onChange={updateFilters}
              onClearAll={clearFilters}
              activeCount={activeCount}
              sort={sort}
              onSortChange={setSort}
              storeOptions={storeOptions}
              departmentOptions={ownScopeOnly ? [] : departmentOptions}
              view={view}
              groupBy={boardGroupBy}
              onGroupByChange={setBoardGroupBy}
              fieldVisibility={fieldVisibility}
              onToggleField={toggleField}
              assignableUsers={ownScopeOnly ? undefined : assignableUsers}
              tags={tags}
              isAdmin={isVerifier}
              canExport={isVerifier}
              onExport={() => setShowExport(true)}
              hideCategory={!!lockCategory}
              resultCount={sorted.length}
              totalCount={scopeFiltered.length}
              scope={scope}
            />
            </div>
    </>
  );

  return (
    <div className="flex flex-col gap-3 pt-2.5 mx-auto w-full max-w-(--container-width) transition-all duration-300">
      <CreatedRangeBanner range={createdRange.range} onClear={createdRange.clear} noun="delegations" />

      <div className="flex flex-col gap-3">
        {!hideHeader && (
          <>
        
            <h1 className="sr-only">{title ?? 'Delegation'}</h1>

            <TaskQuickStats
              counts={quickCounts}
              total={scopeFiltered.length}
              active={quickFilter}
              onToggle={toggleQuickFilter}
              onClear={() => setQuickFilter(null)}
              isLoading={isPending}
            />
          </>
        )}

      
        <div className="flex items-center gap-3 flex-wrap">
          {/* View lives in the toolbar, not inside Options. It changes what the whole page looks
              like, so it reads as a place you are rather than a setting you went and configured —
              and unlike every other control here it isn't a way of narrowing the list. */}
          {/* Hidden on phones (only List is available there), but still mounted: ViewToggle's own
              effect is what switches a Board/Table/Timeline view back to List on a narrow screen. */}
          <div className="hidden sm:block">
            <ViewToggle tabs={VIEW_TABS} value={view} onChange={changeView} storageKey={`view:tasks:${user?.id ?? "anon"}`} />
          </div>

          {activeChips.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              {activeChips.map(chip => (
                <span
                  key={chip.key}
                  className="flex items-center gap-1.5 pl-3 pr-1.5 py-1 text-xs font-semibold rounded-lg bg-primary-50/80 text-primary-700 border border-primary-200/60 dark:bg-primary-900/20 dark:border-primary-800/80 dark:text-primary-300"
                >
                  {chip.label}
                  <button
                    type="button"
                    onClick={chip.onClear}
                    aria-label={`Clear ${chip.label} filter`}
                    className="p-1 rounded-md hover:bg-primary-200/50 dark:hover:bg-primary-800/50 transition-colors duration-200 ease-in-out cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}

              <button
                type="button"
                onClick={saveFilters}
                title="Save this filter combination as your default"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-text-muted hover:text-text hover:bg-surface border border-transparent hover:border-border transition-all duration-200 ease-in-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Save size={13} />
                Save view
              </button>
            </div>
          )}

       

          {/* Only when the server actually has more than it sent. Says so plainly rather than
              letting the stat tiles above present a partial count as the total. */}
          {listMeta?.hasNext && (
            <span
              className="text-xs font-semibold tracking-tight text-warning tabular-nums"
              title={`This page holds the ${listMeta.limit} most recent delegations. Counts above describe these, not all ${listMeta.total}.`}
            >
              Newest {listMeta.limit} of {listMeta.total}
            </span>
          )}

        
          {/* Sort, Store and Department all live inside Options now, so the toolbar's right side
              is just the primary actions. `sm:ml-auto`, not a bare `ml-auto` — the Create button
              inside `headerActions` is `hidden md:block`, so on mobile this only ever holds
              Options, and an unconditional auto-margin pushed that one pill hard right, leaving a
              dead gap in front of it. */}
          {scope && (
            <PhoneScopeSwitch
              options={[{ value: 'mine', label: 'Assigned to me' }, { value: 'byMe', label: 'Created by me' }]}
              value={scope.value}
              allValue="all"
              onChange={scope.onChange}
            />
          )}
          <div className="flex items-center gap-2.5 flex-wrap shrink-0 ml-auto">
            <CreatedRangePicker createdRange={createdRange} className="hidden sm:inline-flex" />
            {headerActions}
          </div>
        </div>
      </div>

      {isPending && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 items-start">
              {Array.from({ length: 4 }).map((_, col) => (
                  <div key={col} className="flex flex-col gap-4 p-3 bg-surface-hover/30 border border-border/50 rounded-xl">
                      <Skeleton className="h-6 w-32 rounded-md mx-2 mt-2" />
                      {Array.from({ length: 3 }).map((_, i) => (
                          <div key={i} className="flex flex-col gap-3 p-4 rounded-lg border border-border bg-surface">
                              <Skeleton className="h-5 w-3/4 rounded-md" />
                              <Skeleton className="h-4 w-1/2 rounded-md" />
                              <div className="flex justify-between items-center mt-2">
                                  <Skeleton className="h-5 w-16 rounded-md" />
                                  <Skeleton className="w-7 h-7 rounded-full" />
                              </div>
                          </div>
                      ))}
                  </div>
              ))}
          </div>
      )}

      
      {isError && (
        <div className="flex items-start gap-3 p-4 bg-danger/5 rounded-xl border border-danger/20 text-danger">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div>
            <h4 className="text-sm font-medium">Error Loading Delegations</h4>
            <p className="text-sm mt-1 opacity-90">Failed to connect to the server. Please refresh the page.</p>
          </div>
        </div>
      )}

      {!isPending && !isError && isEmpty && (
        // Phones get the compact one-line version: the full icon + heading + paragraph block took
        // most of the screen to say "nothing here".
        <EmptyState
          icon={Inbox}
          size={isMobile ? 'compact' : undefined}
          title={emptyTitle ?? (isMobile ? 'Nothing here' : 'No delegations found')}
          description={isMobile ? undefined : activeCount > 0
            ? "No delegations match the current filters. Try adjusting or clearing them to see more."
            : (emptyDescription ?? "You're all caught up! There are no delegations assigned to this view.")}
          action={activeCount > 0 ? { label: 'Clear all filters', onClick: clearFilters } : undefined}
        />
      )}

    
      {!isPending && !isError && !isEmpty && (
        <div className="pb-12">
          {/* All four views receive the same already-scoped, already-filtered, already-sorted
              `sorted` array and the same field visibility — a view is a layout, never its own
              query or its own filter logic. */}
          {view === 'list' && (
            <TaskListView
              tasks={sorted}
              departmentNames={departmentNames}
              assigneeNames={assigneeNames}
              onOpen={handleOpen}
              fields={fieldVisibility}
              newlyAssignedTaskIds={newlyAssignedTaskIds}
            />
          )}

          {view === 'table' && (
            <TaskTable
              tasks={sorted}
              assigneeNames={assigneeNames}
              departmentNames={departmentNames}
              onOpen={handleOpen}
              fields={fieldVisibility}
              newlyAssignedTaskIds={newlyAssignedTaskIds}
            />
          )}

          {view === 'timeline' && (
            <TaskTimeline
              tasks={sorted}
              assigneeNames={assigneeNames}
              departmentNames={departmentNames}
              onOpen={handleOpen}
              fields={fieldVisibility}
              newlyAssignedTaskIds={newlyAssignedTaskIds}
            />
          )}

          {view === 'board' && (
            <TaskBoard
              tasks={sorted}
              assigneeNames={assigneeNames}
              departmentNames={departmentNames}
              isVerifier={isVerifier}
              onOpen={handleOpen}
              onAddTask={openCreateForm}
              fields={fieldVisibility}
              newlyAssignedTaskIds={newlyAssignedTaskIds}
              isFiltered={activeCount > 0 || quickFilter !== null}
              groupBy={boardGroupBy}
            />
          )}
        </div>
      )}

      
      {showForm && (
        <TaskForm
          onClose={() => setShowForm(false)}
        />
      )}
      {showSmartModal && <SmartTaskModal onClose={() => setShowSmartModal(false)} />}
      {showBulkImport && <TaskBulkImportModal onClose={() => setShowBulkImport(false)} />}
      {showExport && (
        <ExportDialog
          reportModule="tasks"
          title="Export Delegations"
          description="Every delegation created in the selected period — status, priority, department, and assignee."
          onClose={() => setShowExport(false)}
        />
      )}
      {selected && (
        <TaskDetail
          key={selected.task.id}
          task={selected.task}
          initialMode={selected.mode}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
};