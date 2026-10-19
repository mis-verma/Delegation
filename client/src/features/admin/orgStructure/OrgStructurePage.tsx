import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { MotionConfig } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Network, Search, Maximize2, Minimize2, Inbox, Store, Layers, Users, UserX, TriangleAlert, CircleCheck } from 'lucide-react';
import { Button, EmptyState, InlineError, Input, PANEL_CLASS, PageHeader, Skeleton, ToggleChip, useConfirm } from '../../../components';
import { StatCard } from '../../dashboard';
import { adminApi, type AdminUser } from '../../../api/admin';
import type { Department } from '../../../api/departments';
import type { Store as StoreRow } from '../../../api/stores';
import { useDepartmentsQuery, useUsersQuery } from '../hook';
import { useStoresQuery } from '../../tickets/hook';
import { StoreSection } from './StoreSection';
import { DepartmentSection } from './DepartmentSection';
import { UserRow } from './UserRow';
import { OrgMoveContext, type MoveTarget, type OrgMoveApi } from './orgMoveContext';
import { OrgScoresContext, useAllMonthScores } from '../directory/orgScoreData';
import {
  buildOrgTree,
  filterOrgTree,
  isLeavingDropTarget,
  needsDepartment,
  readDraggedUser,
  type OrgMovePatch,
} from './orgStructureDisplay';

const USERS_KEY = ['admin-users'] as const;
const DEPARTMENTS_KEY = ['departments'] as const;
const STORES_KEY = ['stores'] as const;

const OrgStructureSkeleton = () => (
  <div className="flex flex-col gap-4">
    {Array.from({ length: 3 }).map((_, i) => (
      <Skeleton key={i} className="h-24 rounded-2xl" />
    ))}
  </div>
);

const BucketHeader = ({ title, hint, count }: { title: string; hint: string; count: number }) => (
  <div className="flex items-start gap-3">
    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-warning/30 bg-warning/15 text-warning">
      <TriangleAlert className="size-4" aria-hidden />
    </span>
    <div className="min-w-0 flex-1 flex flex-col gap-0.5">
      <h3 className="t-card font-display font-bold leading-snug text-text">{title}</h3>
      <p className="t-meta font-display text-text-muted">{hint}</p>
    </div>
    <span className="shrink-0 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 t-meta font-display font-bold tabular-nums text-warning">
      {count}
    </span>
  </div>
);

interface OrgStructurePageProps {
  embedded?: boolean;
}

export const OrgStructurePage = ({ embedded = false }: OrgStructurePageProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { data: stores, isPending: storesPending, isError: storesError, refetch: refetchStores } = useStoresQuery();
  const { data: departments, isPending: deptsPending, isError: deptsError, refetch: refetchDepts } = useDepartmentsQuery();
  const { data: users, isPending: usersPending, isError: usersError, refetch: refetchUsers } = useUsersQuery();

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [expandedStores, setExpandedStores] = useState<Set<string>>(new Set());
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [isUnassignDropTarget, setIsUnassignDropTarget] = useState(false);
  const orgScores = useAllMonthScores();

  const isPending = storesPending || deptsPending || usersPending;
  const isError = storesError || deptsError || usersError;
  const hasAllData = !!stores && !!departments && !!users;

  const tree = useMemo(
    () => buildOrgTree(stores ?? [], departments ?? [], users ?? [], showDeactivated),
    [stores, departments, users, showDeactivated]
  );
  const visibleTree = useMemo(() => filterOrgTree(tree, deferredQuery), [tree, deferredQuery]);
  const forceOpen = deferredQuery.trim().length > 0;

  const people = useMemo(() => {
    const all = users ?? [];
    const active = all.filter((u) => u.isActive).length;
    const unplaced = all.filter((u) => u.isActive && !u.departmentId && !u.storeId).length;
    return { active, deactivated: all.length - active, unplaced };
  }, [users]);

  const attention = useMemo(() => {
    const activeDepartments = (departments ?? []).filter((d) => d.isActive);
    const headedDepartmentIds = new Set(
      (users ?? []).filter((u) => u.isActive && u.departmentId && (u.role === 'MANAGER' || u.role === 'SENIOR')).map((u) => u.departmentId)
    );
    return [
      { key: 'no-store', label: 'Departments without a store', count: activeDepartments.filter((d) => !d.storeId).length },
      { key: 'no-dept', label: 'People without a department', count: (users ?? []).filter(needsDepartment).length },
      { key: 'no-head', label: 'Departments without a head', count: activeDepartments.filter((d) => !d.headOptional && !headedDepartmentIds.has(d.id)).length },
    ].filter((item) => item.count > 0);
  }, [departments, users]);

  const toggleInSet = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const toggleStore = useCallback((id: string) => setExpandedStores((prev) => toggleInSet(prev, id)), []);
  const toggleDept = useCallback((id: string) => setExpandedDepts((prev) => toggleInSet(prev, id)), []);
  const isDeptOpen = useCallback((id: string) => expandedDepts.has(id), [expandedDepts]);

  const moveMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: OrgMovePatch; successMessage: string }) =>
      adminApi.update(id, patch).then((r) => r.data),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: USERS_KEY });
      const previous = queryClient.getQueryData<AdminUser[]>(USERS_KEY);
      queryClient.setQueryData<AdminUser[]>(USERS_KEY, (old) =>
        old?.map((u) =>
          u.id === id ? { ...u, departmentId: patch.departmentId, ...(patch.storeId !== undefined ? { storeId: patch.storeId } : {}) } : u
        )
      );
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(USERS_KEY, context.previous);
      toast.error(err instanceof Error ? err.message : "Couldn't move this person. Nothing was changed.");
    },
    onSuccess: (_data, { successMessage }) => toast.success(successMessage),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: USERS_KEY });
      queryClient.invalidateQueries({ queryKey: ['assignable-users'] });
    },
  });
  const { mutate: runMove } = moveMutation;

  const moveUser = useCallback(
    async (userId: string, patch: OrgMovePatch) => {
      const person = queryClient.getQueryData<AdminUser[]>(USERS_KEY)?.find((u) => u.id === userId);
      const first = person?.firstName ?? 'Person';
      if (!patch.departmentId && person?.departmentId) {
        const ok = await confirm({
          title: `Take ${first} out of their department?`,
          description: patch.storeId === null
            ? 'They will have no department and no store until you move them again.'
            : 'They will have no department, only the store, until you move them again.',
          confirmLabel: 'Remove',
          variant: 'danger',
        });
        if (!ok) return;
      }
      let successMessage: string;
      if (patch.departmentId) {
        const name = queryClient.getQueryData<Department[]>(DEPARTMENTS_KEY)?.find((d) => d.id === patch.departmentId)?.name;
        successMessage = `Moved ${first} to ${name ?? 'the new department'}`;
      } else if (patch.storeId) {
        const name = queryClient.getQueryData<StoreRow[]>(STORES_KEY)?.find((s) => s.id === patch.storeId)?.name;
        successMessage = `Moved ${first} to ${name ?? 'the store'}`;
      } else {
        successMessage = `${first} no longer has a department or store`;
      }
      runMove({ id: userId, patch, successMessage });
    },
    [queryClient, runMove, confirm]
  );

  const moveTargets = useMemo<MoveTarget[]>(() => {
    const storeNames = new Map((stores ?? []).map((s) => [s.id, s.name]));
    return (departments ?? [])
      .filter((d) => d.isActive)
      .map((d) => ({ id: d.id, name: d.name, storeId: d.storeId, storeName: d.storeId ? (storeNames.get(d.storeId) ?? null) : null }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [departments, stores]);
  const nameOf = useCallback(
    (userId: string) => {
      const person = users?.find((u) => u.id === userId);
      return person ? `${person.firstName} ${person.lastName ?? ''}`.trim() : undefined;
    },
    [users],
  );
  const moveApi = useMemo<OrgMoveApi>(() => ({ targets: moveTargets, moveUser, nameOf }), [moveTargets, moveUser, nameOf]);

  const handleUserDragStart = useCallback((_user: AdminUser) => {}, []);
  const handleUserDragEnd = useCallback(() => {}, []);

  const expandAll = () => {
    setExpandedStores(new Set(tree.stores.map((s) => s.store.id)));
    setExpandedDepts(
      new Set([
        ...tree.stores.flatMap((s) => s.departments.map((d) => d.department.id)),
        ...tree.unassignedDepartments.map((d) => d.department.id),
      ])
    );
  };
  const collapseAll = () => {
    setExpandedStores(new Set());
    setExpandedDepts(new Set());
  };

  const retryAll = () => {
    refetchStores();
    refetchDepts();
    refetchUsers();
  };

  const hasAnyResults =
    visibleTree.stores.length > 0 || visibleTree.unassignedDepartments.length > 0 || visibleTree.unassignedUsers.length > 0;

  const renderContent = () => {
    if (isPending) return <OrgStructureSkeleton />;
    if (isError && !hasAllData) {
      return <InlineError message="Couldn't load the organization structure. Check your connection and try again." onRetry={retryAll} />;
    }
    if (!hasAnyResults) {
      return deferredQuery.trim() ? (
        <EmptyState
          icon={Search}
          title="No matches"
          description="Nothing here matches that search. Try a store, a department, a role or a person's name."
          action={{ label: 'Clear search', onClick: () => setQuery('') }}
        />
      ) : (
        <EmptyState
          icon={Inbox}
          title="Nothing set up yet"
          description="Add stores and departments, then assign people to them to see the structure here."
          action={{ label: 'Open People & Teams', onClick: () => navigate('/admin/directory?tab=departments') }}
        />
      );
    }

    return (
      <div className="flex flex-col gap-4 sm:gap-6">
        {visibleTree.stores.map((node) => (
          <StoreSection
            key={node.store.id}
            node={node}
            isOpen={expandedStores.has(node.store.id)}
            forceOpen={forceOpen}
            onToggle={toggleStore}
            isDeptOpen={isDeptOpen}
            onToggleDept={toggleDept}
            onDropUser={moveUser}
            onUserDragStart={handleUserDragStart}
            onUserDragEnd={handleUserDragEnd}
          />
        ))}

        {visibleTree.unassignedDepartments.length > 0 && (
          <section aria-label="Departments without a store" className="flex flex-col gap-4 rounded-2xl border border-warning/40 bg-warning/5 p-4 sm:p-5">
            <BucketHeader
              title="Departments without a store"
              hint="Pick a store for each of these so their people show up under it."
              count={visibleTree.unassignedDepartments.length}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 items-start gap-3 sm:gap-4">
              {visibleTree.unassignedDepartments.map((d) => (
                <DepartmentSection
                  key={d.department.id}
                  node={d}
                  isOpen={expandedDepts.has(d.department.id)}
                  forceOpen={forceOpen}
                  onToggle={toggleDept}
                  showUnassignedStoreHint
                  onDropUser={moveUser}
                  onUserDragStart={handleUserDragStart}
                  onUserDragEnd={handleUserDragEnd}
                />
              ))}
            </div>
          </section>
        )}

        {visibleTree.unassignedUsers.length > 0 && (
          <section
            aria-label="People without a department or store"
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
            onDragEnter={() => setIsUnassignDropTarget(true)}
            onDragLeave={(e) => { if (isLeavingDropTarget(e)) setIsUnassignDropTarget(false); }}
            onDrop={(e) => {
              e.preventDefault();
              setIsUnassignDropTarget(false);
              const dragged = readDraggedUser(e);
              if (!dragged || (dragged.departmentId === null && dragged.storeId === null)) return;
              moveUser(dragged.id, { departmentId: null, storeId: null });
            }}
            className={`flex flex-col gap-4 rounded-2xl border p-4 sm:p-5 transition-colors duration-200 ${
              isUnassignDropTarget
                ? 'border-warning bg-warning/15 outline outline-2 -outline-offset-2 outline-warning/40'
                : 'border-warning/40 bg-warning/5'
            }`}
          >
            <BucketHeader
              title={isUnassignDropTarget ? 'Drop to unassign' : 'People without a department or store'}
              hint="Drag someone onto a department, or use Move to on their row."
              count={visibleTree.unassignedUsers.length}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {visibleTree.unassignedUsers.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  className="border border-border bg-surface"
                  onDragStart={handleUserDragStart}
                  onDragEnd={handleUserDragEnd}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    );
  };

  const expandCollapse = (
    <>
      <Button variant="outline" size="sm" onClick={expandAll} disabled={isPending} aria-label="Expand all" className="max-sm:size-11 max-sm:px-0">
        <Maximize2 className="size-4 sm:size-3.5" aria-hidden /> <span className="max-sm:sr-only">Expand all</span>
      </Button>
      <Button variant="outline" size="sm" onClick={collapseAll} disabled={isPending} aria-label="Collapse all" className="max-sm:size-11 max-sm:px-0">
        <Minimize2 className="size-4 sm:size-3.5" aria-hidden /> <span className="max-sm:sr-only">Collapse all</span>
      </Button>
    </>
  );

  return (
    <MotionConfig reducedMotion="user">
      <OrgMoveContext.Provider value={moveApi}>
      <OrgScoresContext.Provider value={orgScores}>
        <div className="flex flex-col gap-5 sm:gap-6 w-full">
          {!embedded && (
            <PageHeader
              icon={Network}
              title="Organization structure"
              subtitle="Every store, its departments, and who sits where. Drag a person onto a department, or use Move to on their row."
              actions={expandCollapse}
            />
          )}

          <div className="grid grid-cols-4 gap-1.5 sm:hidden" aria-label="Org at a glance">
            {[
              { icon: Users, label: 'People', value: users ? people.active : null, tile: 'from-primary-500 to-primary-700' },
              { icon: Store, label: 'Stores', value: stores ? stores.length : null, tile: 'from-coral-400 to-coral-600' },
              { icon: Layers, label: 'Depts', value: departments ? departments.length : null, tile: 'from-primary-400 to-primary-600' },
              { icon: UserX, label: 'Unplaced', value: users ? people.unplaced : null, tile: people.unplaced > 0 ? 'from-warning to-warning' : 'from-success to-success' },
            ].map(({ icon: Icon, label, value, tile }) => (
              <div key={label} className={`${PANEL_CLASS} flex flex-col items-center gap-1 px-1 py-2.5`}>
                <span className={`flex size-7 items-center justify-center rounded-lg bg-linear-to-br text-white ${tile}`} aria-hidden>
                  <Icon className="size-3.5" strokeWidth={2.5} />
                </span>
                {value === null ? <Skeleton className="h-5 w-8" /> : <span className="t-card font-display font-bold tabular-nums text-text">{value.toLocaleString()}</span>}
                <span className="t-meta font-display text-text-muted">{label}</span>
              </div>
            ))}
          </div>

          <div className="hidden sm:grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard modern
              icon={Users}
              label="People"
              value={users ? people.active : 'No data'}
              caption={people.deactivated > 0 ? `${people.deactivated} deactivated` : 'Active across your org'}
              isLoading={usersPending}
              compact
              highlight
              decorative
            />
            <StatCard modern
              icon={Store}
              iconTint="text-coral-600 dark:text-coral-400"
              label="Stores"
              value={stores ? stores.length : 'No data'}
              caption={stores?.length === 1 ? '1 location' : `${stores?.length ?? 0} locations`}
              isLoading={storesPending}
              compact
            />
            <StatCard modern
              icon={Layers}
              iconTint="text-primary-600 dark:text-primary-400"
              label="Departments"
              value={departments ? departments.length : 'No data'}
              caption="Org-wide"
              isLoading={deptsPending}
              compact
            />
            <StatCard modern
              icon={UserX}
              iconTint={people.unplaced > 0 ? 'text-warning' : 'text-success'}
              label="Unassigned"
              value={users ? people.unplaced : 'No data'}
              caption={people.unplaced > 0 ? 'No department or store' : 'Everyone is placed'}
              isLoading={usersPending}
              compact
            />
          </div>

          {(isPending || hasAllData) && (
            <section aria-label="Needs attention" className={`${PANEL_CLASS} flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3`}>
              <h2 className="flex items-center gap-2 t-card font-display font-bold text-text shrink-0">
                {attention.length === 0 && !isPending ? (
                  <CircleCheck className="size-4 text-success" aria-hidden />
                ) : (
                  <TriangleAlert className="size-4 text-warning" aria-hidden />
                )}
                Needs attention
              </h2>
              {isPending ? (
                <Skeleton className="h-6 w-1/2" />
              ) : attention.length === 0 ? (
                <p className="t-meta font-display text-text-muted">
                  Every active department has a store and a head, and everyone is in a department.
                </p>
              ) : (
                <ul className="flex flex-wrap items-center gap-2">
                  {attention.map((item) => (
                    <li key={item.key} className="inline-flex items-center gap-2 rounded-full border border-warning/25 bg-warning/10 pl-3 pr-1.5 py-1">
                      <span className="t-meta font-display font-semibold text-text">{item.label}</span>
                      <span className="min-w-6 text-center rounded-full bg-warning/20 px-1.5 t-meta font-display font-bold tabular-nums text-warning">{item.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex-1 basis-40 min-w-0 sm:max-w-xl">
              <Input
                id="org-search"
                type="search"
                icon={Search}
                aria-label="Search stores, departments, roles or people"
                placeholder="Search stores, departments, people"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {(people.deactivated > 0 || showDeactivated) && (
              <ToggleChip on={showDeactivated} onClick={() => setShowDeactivated((v) => !v)}>
                Show deactivated{people.deactivated > 0 ? ` (${people.deactivated})` : ''}
              </ToggleChip>
            )}
            {embedded && <div className="flex items-center gap-2 sm:ml-auto shrink-0">{expandCollapse}</div>}
          </div>

          {isError && hasAllData && (
            <InlineError message="Couldn't refresh the latest changes. Showing what we loaded earlier." onRetry={retryAll} />
          )}

          {renderContent()}
        </div>
      </OrgScoresContext.Provider>
      </OrgMoveContext.Provider>
    </MotionConfig>
  );
};
