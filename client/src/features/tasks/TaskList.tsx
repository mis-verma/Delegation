import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { Wand2, Save, Inbox, X, Plus, ChevronDown, Upload, UserCheck, PenLine } from "lucide-react";
import { Skeleton, Fab, ViewToggle, EmptyState, InlineError, Button, type ViewTab } from "../../components";
import { CreatedRangeBanner, CreatedRangePicker, ScoreDrillBanner } from "../../components/createdRangeBanner";
import { useCreatedRange } from "../../lib/createdRange";
import { taskMatchesDrill, useScoreDrill } from "../../lib/scoreDrill";
import { ExportDialog } from "../reports";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { useTasksQuery, useTasksMetaQuery, useAssignableUsersQuery, taskDetailQueryOptions } from "./hook";
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

const VIEW_TABS: ViewTab<TaskViewKey>[] = TASK_VIEWS.map((key) => ({
  key,
  label: TASK_VIEW_LABEL[key],
  icon: TASK_VIEW_ICON[key],
  mobileHidden: key !== 'list',
}));

interface TaskListProps {
  userId?: string;
  hideHeader?: boolean;
  lockCategory?: CategoryFilterKey;
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

const filtersStorageKey = (userId?: string, lockCategory?: CategoryFilterKey) =>
  `task-filters:${userId ?? 'anon'}${lockCategory ? `:${lockCategory}` : ''}`;

export const TaskList = ({ userId, hideHeader = false, lockCategory, title, emptyTitle, emptyDescription }: TaskListProps = {}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
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

  const withLock = useCallback(
    (f: TaskFilters): TaskFilters => (lockCategory ? { ...f, category: lockCategory } : f),
    [lockCategory],
  );

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
    }
    return withLock(DEFAULT_FILTERS);
  });

  const { data: tasks, isPending, isError, refetch: refetchTasks } = useTasksQuery(userId, true, filters.tagIds);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadAssignmentByTaskId]);

  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || !tasks) return;
    const match = tasks.find(t => t.id === openId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (match) handleOpen(match);
    else {
      queryClient.fetchQuery(taskDetailQueryOptions(openId))
        .then((task) => handleOpen(task))
        .catch(() => toast.error("Couldn't open that delegation. It may have been deleted."));
    }
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('open');
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, tasks]);

  useEffect(() => {
    if (!searchParams.get('create')) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowForm(true);
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

  const [view, setView] = useState<TaskViewKey>(() => {
    const fromUrl = searchParams.get('view');
    return isTaskViewKey(fromUrl) ? fromUrl : defaultTaskView(isMobile);
  });

  const changeView = (next: TaskViewKey) => {
    setView(next);
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
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
    }
  };

  const departmentStoreId = useMemo(
    () => new Map((departments ?? []).map(d => [d.id, d.storeId])),
    [departments],
  );
  const updateFilters = (patch: Partial<TaskFilters>) => {
    const next = withLock({ ...filters, ...patch });
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
    setScopeKey('all');
  };

  const toggleQuickFilter = (key: QuickFilterKey) => {
    setQuickFilter((prev) => (prev === key ? null : key));
  };

  const [scopeKey, setScopeKey] = useState<TaskScopeKey>(() => {
    if (!user) return 'all';
    if (filters.assigneeIds.length === 1 && filters.assigneeIds[0] === user.id) return 'mine';
    if (filters.raisedByIds.length === 1 && filters.raisedByIds[0] === user.id) return 'byMe';
    return 'all';
  });
  const isAssignedToMe = !!user && scopeKey === 'mine';
  const isAssignedByMe = !!user && scopeKey === 'byMe';
  const scope: { value: TaskScopeKey; onChange: (next: TaskScopeKey) => void } | undefined = !userId && user ? {
    value: scopeKey,
    onChange: (next) => {
      setScopeKey(next);
      const selfAssignee = filters.assigneeIds.length === 1 && filters.assigneeIds[0] === user.id;
      const selfRaiser = filters.raisedByIds.length === 1 && filters.raisedByIds[0] === user.id;
      if (selfAssignee || selfRaiser) {
        updateFilters({ ...(selfAssignee ? { assigneeIds: [] } : {}), ...(selfRaiser ? { raisedByIds: [] } : {}) });
      }
    },
  } : undefined;

  const saveFilters = () => {
    try {
      localStorage.setItem(filtersStorageKey(user?.id, lockCategory), JSON.stringify(filters));
      toast.success('Filter saved');
    } catch {
      toast.error('Could not save filter');
    }
  };

  const assigneeNames = useMemo(
    () => new Map((assignableUsers ?? []).map(u => [u.id, `${u.firstName} ${u.lastName ?? ''}`.trim()])),
    [assignableUsers],
  );
  const departmentNames = useMemo(
    () => new Map((departments ?? []).map(d => [d.id, d.name])),
    [departments],
  );
  const tagNames = useMemo(
    () => new Map((tags ?? []).map(t => [t.id, t.name])),
    [tags],
  );
  const storeOptions = useMemo(
    () => (stores ?? []).filter(s => s.isActive).map(s => ({ id: s.id, name: s.name })),
    [stores],
  );

  const departmentOptions = useMemo(
    () => (departments ?? [])
      .filter(d => d.isActive && (!filters.storeId || d.storeId === filters.storeId))
      .map(d => ({ id: d.id, name: d.name })),
    [departments, filters.storeId],
  );

  const mineOnly = searchParams.get('mine') === '1';
  const createdRange = useCreatedRange();
  const scoreDrill = useScoreDrill(false);
  const mineFiltered = useMemo(() => {
    const everything = tasks ?? [];
    const mine = !mineOnly || !user
      ? everything
      : everything.filter(t => t.userId === user.id || t.assigneeId === user.id || t.additionalAssigneeIds.includes(user.id));
    const created = createdRange.range ? mine.filter(t => createdRange.matches(t.createdAt)) : mine;
    return scoreDrill.active ? created.filter(t => taskMatchesDrill(scoreDrill, t)) : created;
  }, [tasks, mineOnly, user, createdRange, scoreDrill]);

  const scopeFiltered = useMemo(() => {
    const inStore = !filters.storeId
      ? mineFiltered
      : mineFiltered.filter(t => !!t.departmentId && departmentStoreId.get(t.departmentId) === filters.storeId);
    if (!user) return inStore;
    if (isAssignedToMe) return inStore.filter(t => taskAssigneeIds(t).includes(user.id));
    if (isAssignedByMe) return inStore.filter(t => t.userId === user.id);
    return inStore;
  }, [mineFiltered, filters.storeId, departmentStoreId, user, isAssignedToMe, isAssignedByMe]);

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

  const quickCounts = {
    pending: scopeFiltered.filter(QUICK_FILTER_PREDICATES.pending).length,
    completed: scopeFiltered.filter(QUICK_FILTER_PREDICATES.completed).length,
    due: scopeFiltered.filter(QUICK_FILTER_PREDICATES.due).length,
    delayed: scopeFiltered.filter(QUICK_FILTER_PREDICATES.delayed).length,
  };

  const sorted = useMemo(() => [...filtered].sort(SORT_COMPARATORS[sort]), [filtered, sort]);

  const activeChips: { key: string; label: string; onClear: () => void; scope?: boolean }[] = [
    ...(filters.status !== 'all' ? [{ key: 'status', label: `Status: ${STATUS_LABEL[filters.status]}`, onClear: () => updateFilters({ status: 'all' }) }] : []),
    ...(!lockCategory && filters.category !== 'all' ? [{ key: 'category', label: `Category: ${filters.category === 'task' ? 'Direct Task' : filters.category === 'issue' ? 'Issues' : 'Delegations'}`, onClear: () => updateFilters({ category: 'all' }) }] : []),
    ...(filters.priority.length > 0 ? [{
      key: 'priority',
      label: `Priority: ${filters.priority.map(p => PRIORITY_MAP[p].label).join(', ')}`,
      onClear: () => updateFilters({ priority: [] }),
    }] : []),
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
      scope: isAssignedToMe && !!user && filters.assigneeIds.length === 1 && filters.assigneeIds[0] === user.id,
    }] : []),
    ...(filters.raisedByIds.length > 0 ? [{
      key: 'raisedByIds',
      label: filters.raisedByIds.length === 1
        ? `Raised by: ${assigneeNames.get(filters.raisedByIds[0]) ?? 'Unknown'}`
        : `Raised by: ${filters.raisedByIds.length}`,
      onClear: () => updateFilters({ raisedByIds: [] }),
      scope: isAssignedByMe && !!user && filters.raisedByIds.length === 1 && filters.raisedByIds[0] === user.id,
    }] : []),
    ...(filters.tagIds.length > 0 ? [{
      key: 'tagIds',
      label: filters.tagIds.length <= 2
        ? `Labels: ${filters.tagIds.map(id => tagNames.get(id) ?? 'Unknown').join(', ')}`
        : `Labels: ${filters.tagIds.length}`,
      onClear: () => updateFilters({ tagIds: [] }),
    }] : []),
  ];

  const filterChips = activeChips.filter((chip) => !chip.scope);
  const activeCount = filterChips.length;

  const isEmpty = sorted.length === 0;
  const isFiltered = activeCount > 0 || quickFilter !== null || isAssignedToMe || isAssignedByMe;

  const headerActions = (
    <>
          
            {!userId && (
              <>
                <div className="hidden md:flex items-center gap-1">
                  <Button variant="primary" size="sm" onClick={() => setShowForm(true)} className="font-display">
                    <Plus size={14} strokeWidth={2.5} />
                    New delegation
                  </Button>
                  {isVerifier && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="px-2" aria-label="More ways to create">
                          <ChevronDown size={14} strokeWidth={2.5} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" sideOffset={6} className="w-64 rounded-xl p-1.5">
                        {[
                          { key: 'smart', icon: Wand2, title: 'Smart Add', hint: 'Type it in plain words, the form fills itself', onClick: () => setShowSmartModal(true) },
                          { key: 'bulk', icon: Upload, title: 'Bulk import', hint: 'Upload a sheet, create many at once', onClick: () => setShowBulkImport(true) },
                        ].map(({ key, icon: ItemIcon, title: itemTitle, hint, onClick }) => (
                          <DropdownMenuItem key={key} onClick={onClick} className="gap-3 px-2 py-2 rounded-lg cursor-pointer">
                            <ItemIcon size={16} strokeWidth={2.25} className="shrink-0" />
                            <span className="flex flex-col min-w-0 flex-1">
                              <span className="text-sm font-display font-semibold text-text">{itemTitle}</span>
                              <span className="t-meta text-text-muted leading-snug">{hint}</span>
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                <Fab
                  sheetTitle="Create"
                  actions={[
                    { key: 'new', label: 'New delegation', description: 'Give someone a piece of work', icon: Plus, onClick: () => setShowForm(true) },
                    ...(isVerifier ? [
                      { key: 'smart', label: 'Smart Add', description: 'Type or say it, the details fill in', icon: Wand2, onClick: () => setShowSmartModal(true) },
                      { key: 'bulk-import', label: 'Bulk import', description: 'Add many from an Excel sheet', icon: Upload, onClick: () => setShowBulkImport(true) },
                    ] : []),
                  ]}
                />
              </>
            )}

      
            <div className={ownScopeOnly ? 'hidden sm:contents' : 'contents'}>
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
      <ScoreDrillBanner drill={scoreDrill} noun="delegations" />

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
          <div className="hidden sm:block">
            <ViewToggle tabs={VIEW_TABS} value={view} onChange={changeView} storageKey={`view:tasks:${user?.id ?? "anon"}`} />
          </div>

          {filterChips.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap min-w-0 max-sm:order-last max-sm:basis-full">
              {filterChips.map(chip => (
                <span
                  key={chip.key}
                  className={`flex items-center gap-1 pl-3 pr-1 py-0.5 t-meta font-semibold rounded-lg bg-surface text-text border border-border-hover`}
                >
                  {chip.label}
                  <button
                    type="button"
                    onClick={chip.onClear}
                    aria-label={`Clear ${chip.label} filter`}
                    className="flex items-center justify-center size-7 pointer-coarse:size-11 -my-1 pointer-coarse:-my-2.5 rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150 ease-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}

              <button
                type="button"
                onClick={saveFilters}
                title="Save this filter combination as your default"
                className="flex items-center gap-1.5 px-3 py-1.5 t-meta font-semibold rounded-lg text-text-muted hover:text-text hover:bg-surface border border-transparent hover:border-border transition-all duration-200 ease-in-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Save size={13} />
                Save view
              </button>
            </div>
          )}

       

          {listMeta?.hasNext && (
            <span className="t-meta font-semibold tracking-tight text-warning tabular-nums">
              Showing the newest {listMeta.limit} of {listMeta.total}. Counts above cover these only.
            </span>
          )}

        
          {scope && (
            <PhoneScopeSwitch
              options={[{ value: 'mine', label: 'Assigned to me', shortLabel: 'Mine', icon: UserCheck }, { value: 'byMe', label: 'Created by me', shortLabel: 'By me', icon: PenLine }]}
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
        <ul className="sm:hidden flex flex-col gap-3" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="flex flex-col gap-2.5 p-3 rounded-2xl border border-border/60 bg-surface">
              <div className="flex items-start gap-2">
                <Skeleton className="h-4 flex-1 rounded-md" />
                <Skeleton className="size-7 rounded-full" />
              </div>
              <Skeleton className="h-3 w-1/3 rounded-md" />
              <div className="flex gap-1.5">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            </li>
          ))}
        </ul>
      )}
      {isPending && (
          <div className="hidden sm:grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 items-start">
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
        <InlineError message="We couldn't load your delegations. Check your connection and try again." onRetry={() => void refetchTasks()} />
      )}

      {!isPending && !isError && isEmpty && (
        <EmptyState
          icon={Inbox}
          size={isMobile ? 'compact' : undefined}
          title={isFiltered && filterChips.length === 0 && quickFilter === null
            ? (isAssignedToMe ? 'Nothing assigned to you' : 'You have not created any delegations')
            : isFiltered ? 'No delegations match these filters' : (emptyTitle ?? (isMobile ? 'Nothing here yet' : 'No delegations yet'))}
          description={isMobile ? undefined : isFiltered
            ? 'Clear the filters to see everything again.'
            : (emptyDescription ?? 'Delegations given to you or by you show up here.')}
          action={isFiltered ? { label: 'Clear filters', onClick: clearFilters } : undefined}
        />
      )}

    
      {!isPending && !isError && !isEmpty && (
        <div className="pb-12">
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
              isFiltered={isFiltered}
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
          description="Every delegation created in the selected period, with status, priority, department and assignee."
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