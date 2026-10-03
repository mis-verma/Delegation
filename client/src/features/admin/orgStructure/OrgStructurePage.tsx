import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { MotionConfig } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Network, Search, Maximize2, Minimize2, Inbox, Store, Layers, Users, TriangleAlert, CircleCheck } from 'lucide-react';
import { Button, EmptyState, InlineError, Input, PANEL_CLASS, PageHeader, Skeleton, ToggleChip } from '../../../components';
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
import {
  buildOrgTree,
  filterOrgTree,
  isLeavingDropTarget,
  needsDepartment,
  readDraggedUser,
  type OrgMovePatch,
} from './orgStructureDisplay';

// Same keys the shared hooks use (admin/hook.ts, tickets/hook.ts); spelled out here because the
// move mutation below needs to update the cached roster itself.
const USERS_KEY = ['admin-users'] as const;
const DEPARTMENTS_KEY = ['departments'] as const;
const STORES_KEY = ['stores'] as const;

const OrgStructureSkeleton = () => (
  <div className="flex flex-col gap-3">
    {Array.from({ length: 3 }).map((_, i) => (
      <Skeleton key={i} className="h-20 rounded-2xl" />
    ))}
  </div>
);

export const OrgStructurePage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: stores, isPending: storesPending, isError: storesError, refetch: refetchStores } = useStoresQuery();
  const { data: departments, isPending: deptsPending, isError: deptsError, refetch: refetchDepts } = useDepartmentsQuery();
  const { data: users, isPending: usersPending, isError: usersError, refetch: refetchUsers } = useUsersQuery();

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [expandedStores, setExpandedStores] = useState<Set<string>>(new Set());
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [isUnassignDropTarget, setIsUnassignDropTarget] = useState(false);

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
    return { active, deactivated: all.length - active };
  }, [users]);

  // What a glance at this page should flag. Only active departments count: a switched-off one is
  // already out of the way. Admin/PC (org-wide) and store-level Seniors are not "missing" a department.
  const attention = useMemo(() => {
    const activeDepartments = (departments ?? []).filter((d) => d.isActive);
    const headedDepartmentIds = new Set(
      (users ?? []).filter((u) => u.isActive && u.departmentId && (u.role === 'MANAGER' || u.role === 'SENIOR')).map((u) => u.departmentId)
    );
    return [
      { key: 'no-store', label: 'Departments without a store', count: activeDepartments.filter((d) => !d.storeId).length },
      { key: 'no-dept', label: 'People without a department', count: (users ?? []).filter(needsDepartment).length },
      { key: 'no-head', label: 'Departments without a head', count: activeDepartments.filter((d) => !headedDepartmentIds.has(d.id)).length },
    ].filter((item) => item.count > 0);
  }, [departments, users]);

  const toggleInSet = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  // Stable references (empty deps, both only use the functional setState form) so StoreSection/
  // DepartmentSection can be memoized: toggling one store or department no longer hands every
  // sibling a freshly-created callback prop, which would defeat the memo on every render.
  const toggleStore = useCallback((id: string) => setExpandedStores((prev) => toggleInSet(prev, id)), []);
  const toggleDept = useCallback((id: string) => setExpandedDepts((prev) => toggleInSet(prev, id)), []);
  // Unlike toggleStore/toggleDept above, this one's identity CAN'T stay stable, it reads
  // `expandedDepts`, so it has to change whenever that Set does. StoreSection's own memo()
  // comparator is what stops that from fanning out into a re-render of every store section.
  const isDeptOpen = useCallback((id: string) => expandedDepts.has(id), [expandedDepts]);

  // Reassigning is optimistic: the person jumps to their new place at once and snaps back with an
  // error if the server says no. Own mutation (not useUpdateUserMutation) so the success message
  // can name who moved where instead of the generic "User updated".
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

  // Stable: reads names from the query cache at call time instead of closing over the lists.
  const moveUser = useCallback(
    (userId: string, patch: OrgMovePatch) => {
      const first = queryClient.getQueryData<AdminUser[]>(USERS_KEY)?.find((u) => u.id === userId)?.firstName ?? 'Person';
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
    [queryClient, runMove]
  );

  const moveTargets = useMemo<MoveTarget[]>(() => {
    const storeNames = new Map((stores ?? []).map((s) => [s.id, s.name]));
    return (departments ?? [])
      .filter((d) => d.isActive)
      .map((d) => ({ id: d.id, name: d.name, storeId: d.storeId, storeName: d.storeId ? (storeNames.get(d.storeId) ?? null) : null }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [departments, stores]);
  const moveApi = useMemo<OrgMoveApi>(() => ({ targets: moveTargets, moveUser }), [moveTargets, moveUser]);

  // Stable, same reason as the toggles above; the drag callbacks only need to exist so rows render
  // as draggable.
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
      <div className="flex flex-col gap-3">
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
          <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-warning/40 bg-warning/5 p-4 sm:p-5">
            <p className="text-xs font-display font-bold text-warning">Departments without a store</p>
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
        )}

        {visibleTree.unassignedUsers.length > 0 && (
          <div
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
            className={`flex flex-col gap-1 rounded-2xl border border-dashed p-4 sm:p-5 transition-colors duration-200 ${
              isUnassignDropTarget ? 'border-text-muted bg-surface-hover ring-2 ring-text-muted/20' : 'border-border bg-surface-hover/60'
            }`}
          >
            <p className="text-xs font-display font-bold text-text-muted">
              {isUnassignDropTarget ? 'Drop to unassign' : 'People without a department or store'}
            </p>
            <div className="flex flex-col gap-0.5">
              {visibleTree.unassignedUsers.map((u) => (
                <UserRow key={u.id} user={u} onDragStart={handleUserDragStart} onDragEnd={handleUserDragEnd} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <MotionConfig reducedMotion="user">
      <OrgMoveContext.Provider value={moveApi}>
        <div className="flex flex-col gap-5 w-full max-w-5xl mx-auto">
          <PageHeader
            icon={Network}
            title="Organization structure"
            subtitle="Every store, its departments, and who sits where. Drag a person onto a department, or use Move to on their row."
            actions={
              <>
                <Button variant="outline" size="sm" onClick={expandAll} disabled={isPending}>
                  <Maximize2 className="w-3.5 h-3.5" aria-hidden /> Expand all
                </Button>
                <Button variant="outline" size="sm" onClick={collapseAll} disabled={isPending}>
                  <Minimize2 className="w-3.5 h-3.5" aria-hidden /> Collapse all
                </Button>
              </>
            }
          />

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="col-span-2 sm:col-span-1 flex flex-col">
              <StatCard
                icon={Users}
                label="People"
                value={users ? people.active : 'No data'}
                caption={people.deactivated > 0 ? `${people.deactivated} deactivated` : 'Active across your org'}
                isLoading={usersPending}
                compact
                highlight
                decorative
              />
            </div>
            <StatCard
              icon={Store}
              iconTint="text-coral-600 dark:text-coral-400"
              label="Stores"
              value={stores ? stores.length : 'No data'}
              caption={stores?.length === 1 ? '1 location' : `${stores?.length ?? 0} locations`}
              isLoading={storesPending}
              compact
            />
            <StatCard
              icon={Layers}
              iconTint="text-primary-600 dark:text-primary-400"
              label="Departments"
              value={departments ? departments.length : 'No data'}
              caption="Org-wide"
              isLoading={deptsPending}
              compact
            />
          </div>

          {(isPending || hasAllData) && (
            <section aria-label="Needs attention" className={`${PANEL_CLASS} flex flex-col gap-3 p-4`}>
              <h2 className="text-sm font-display font-bold text-text">Needs attention</h2>
              {isPending ? (
                <Skeleton className="h-6 w-2/3" />
              ) : attention.length === 0 ? (
                <p className="flex items-center gap-2 text-sm font-display text-text-muted">
                  <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
                  Every active department has a store and a head, and everyone is in a department.
                </p>
              ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {attention.map((item) => (
                    <li key={item.key} className="flex items-center gap-2 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2">
                      <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />
                      <span className="flex-1 min-w-0 text-xs font-display text-text">{item.label}</span>
                      <span className="shrink-0 text-sm font-display font-bold tabular-nums text-warning">{item.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 basis-64">
              <Input
                id="org-search"
                type="search"
                icon={Search}
                aria-label="Search stores, departments, roles or people"
                placeholder="Search stores, departments, roles or people..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {(people.deactivated > 0 || showDeactivated) && (
              <ToggleChip on={showDeactivated} onClick={() => setShowDeactivated((v) => !v)}>
                Show deactivated{people.deactivated > 0 ? ` (${people.deactivated})` : ''}
              </ToggleChip>
            )}
          </div>

          {/* A failed refresh never hides the structure; it just says so. */}
          {isError && hasAllData && (
            <InlineError message="Couldn't refresh the latest changes. Showing what we loaded earlier." onRetry={retryAll} />
          )}

          {renderContent()}
        </div>
      </OrgMoveContext.Provider>
    </MotionConfig>
  );
};
