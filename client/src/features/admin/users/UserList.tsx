import { useCallback, useMemo, useState, lazy, Suspense } from 'react';
import { toast } from 'sonner';
import { Plus, SearchX, Users } from 'lucide-react';
import type { AdminUser, Role } from '../../../api/admin';
import {
  useUsersQuery,
  useDepartmentsQuery,
  useUpdateUserMutation,
  useDeleteUserMutation,
  useBulkUpdateUsersMutation,
  usePresenceQuery,
} from '../hook';
import { useStoresQuery } from '../../tickets/hook';
import { useAuth } from '../../../context/AuthContext';
import { UserCard, UserCardSkeleton } from './UserCard';
import { UserTable } from './UserTable';
import { UserToolbar } from './UserToolbar';
import { BulkBar } from './BulkBar';
import { OffboardDialog } from './OffboardDialog';
import { ResetPasswordDialog } from './ResetPasswordDialog';
import { useFilteredUsers } from './useFilteredUsers';
import { fullName, peopleCount } from './userDisplay';
import { presenceLabel } from '../presenceDisplay';
import { useMonthScores } from '../directory/orgScoreData';
import { ROLE_LABEL, ROLE_META, isDepartmentHead } from '../roleBadge';
import { exportTitle, type TableRows } from '../../../lib/exportTable';
import {
  EmptyState,
  ExportMenu,
  FormChunkFallback,
  FormLoadError,
  InlineError,
  PANEL_CLASS,
  PageNav,
  Skeleton,
  useConfirm,
} from '../../../components';

const PAGE_SIZE = 24;
const BULK_LIMIT = 100;

const loadUserForm = () => import('./UserForm');
const UserForm = lazy(() =>
  loadUserForm().then(module => ({ default: module.UserForm })).catch(() => ({
    default: FormLoadError,
  }))
);

const UserGridSkeleton = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3" aria-hidden>
    {Array.from({ length: 6 }).map((_, i) => <UserCardSkeleton key={i} />)}
  </div>
);

const UserTableSkeleton = () => (
  <div className={`${PANEL_CLASS} flex flex-col gap-3 p-4`} aria-hidden>
    {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
  </div>
);

export const UserList = () => {
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [offboarding, setOffboarding] = useState<AdminUser | null>(null);
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const { data: allUsers, isPending, isError, refetch } = useUsersQuery();
  const users = useMemo(() => allUsers ?? [], [allUsers]);
  const { data: departments } = useDepartmentsQuery();
  const { data: stores } = useStoresQuery();
  const { data: presenceRows } = usePresenceQuery();
  const reactivateMut = useUpdateUserMutation({ successMessage: (u) => `Reactivated ${fullName(u)}` });
  const deleteMut = useDeleteUserMutation();
  const bulkMut = useBulkUpdateUsersMutation();
  const confirm = useConfirm();
  const { user: me } = useAuth();

  const departmentNames = useMemo(() => new Map((departments ?? []).map(d => [d.id, d.name])), [departments]);
  const storeNames = useMemo(() => new Map((stores ?? []).map(s => [s.id, s.name])), [stores]);
  const presenceById = useMemo(() => new Map((presenceRows ?? []).map(p => [p.id, p])), [presenceRows]);
  const scores = useMonthScores('person');
  const scoreWindow = useMemo(() => ({ from: scores.from, to: scores.to, failed: scores.failed }), [scores.from, scores.to, scores.failed]);

  const list = useFilteredUsers({ users, departmentNames, storeNames, presenceById, pageSize: PAGE_SIZE });
  const { filters, filtered, pageRows, view } = list;

  const departmentOptions = useMemo(
    () => [{ value: '', label: 'All departments' }, ...(departments ?? []).map(d => ({ value: d.id, label: d.name }))],
    [departments],
  );
  const storeOptions = useMemo(
    () => [{ value: '', label: 'All stores' }, ...(stores ?? []).map(s => ({ value: s.id, label: s.name }))],
    [stores],
  );

  const { mutate: updateUser } = reactivateMut;
  const { mutate: deleteUser } = deleteMut;

  const handleEdit = useCallback((user: AdminUser) => {
    if (me?.role === 'PC' && user.role === 'ADMIN') {
      toast.info('Only an admin can change admin accounts.');
      return;
    }
    setEditingUser(user);
  }, [me?.role]);
  const handleResetPassword = useCallback((user: AdminUser) => setResetting(user), []);
  const handleDeactivate = useCallback((user: AdminUser) => setOffboarding(user), []);
  const handleReactivate = useCallback((user: AdminUser) => updateUser({ id: user.id, payload: { isActive: true } }), [updateUser]);
  const handleDelete = useCallback(async (user: AdminUser) => {
    const ok = await confirm({
      title: `Delete ${fullName(user)}?`,
      description: 'This permanently removes their account and can’t be undone. Anyone who has worked in the system can’t be deleted. Deactivate them instead, and they keep their name on old records.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (ok) deleteUser(user.id);
  }, [confirm, deleteUser]);

  const busyId = reactivateMut.isPending
    ? (reactivateMut.variables?.id ?? null)
    : deleteMut.isPending
      ? (deleteMut.variables ?? null)
      : null;

  const exportRows = (): TableRows => [
    ['Name', 'Email', 'Phone', 'Role', 'Department', 'Store', 'Status', 'Joined'],
    ...filtered.map((u) => [
      fullName(u),
      u.email,
      u.phone ?? '',
      ROLE_LABEL[u.role],
      u.departmentId ? departmentNames.get(u.departmentId) ?? '' : '',
      u.storeId ? storeNames.get(u.storeId) ?? '' : '',
      u.isActive ? 'Active' : 'Deactivated',
      u.createdAt.slice(0, 10),
    ]),
  ];

  const selectedPeople = useMemo(() => filtered.filter(u => selectedIds.has(u.id) && u.id !== me?.id), [filtered, selectedIds, me?.id]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const togglePage = useCallback((ids: string[], select: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => (select ? next.add(id) : next.delete(id)));
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const runBulk = async (
    change: { departmentId?: string | null; storeId?: string | null; role?: Role },
    copy: { title: string; description: string; confirmLabel: string; done: string },
  ) => {
    const ids = selectedPeople.map(u => u.id);
    if (ids.length === 0) return;
    if (ids.length > BULK_LIMIT) {
      toast.error(`Pick at most ${BULK_LIMIT} people at a time. You picked ${ids.length}.`);
      return;
    }
    const ok = await confirm({ title: copy.title, description: copy.description, confirmLabel: copy.confirmLabel });
    if (!ok) return;
    bulkMut.mutate({ ids, ...change, successMessage: copy.done }, { onSuccess: clearSelection });
  };

  const moveDepartment = (departmentId: string) => {
    const n = selectedPeople.length;
    const name = departmentId ? departmentNames.get(departmentId) ?? 'this department' : null;
    runBulk(
      { departmentId: departmentId || null },
      name
        ? { title: `Move ${peopleCount(n)} to ${name}?`, description: 'Their department changes right away. You can move them again any time.', confirmLabel: 'Move', done: `Moved ${peopleCount(n)} to ${name}` }
        : { title: `Take ${peopleCount(n)} out of their department?`, description: 'They will have no department until you move them again.', confirmLabel: 'Remove', done: `Removed ${peopleCount(n)} from their department` },
    );
  };

  const moveStore = (storeId: string) => {
    const n = selectedPeople.length;
    const name = storeId ? storeNames.get(storeId) ?? 'this store' : null;
    runBulk(
      { storeId: storeId || null },
      name
        ? { title: `Move ${peopleCount(n)} to ${name}?`, description: 'Their store changes right away. You can move them again any time.', confirmLabel: 'Move', done: `Moved ${peopleCount(n)} to ${name}` }
        : { title: `Take ${peopleCount(n)} out of their store?`, description: 'They will have no store until you move them again.', confirmLabel: 'Remove', done: `Removed ${peopleCount(n)} from their store` },
    );
  };

  const changeRole = (role: Role) => {
    const n = selectedPeople.length;
    const meta = ROLE_META[role];
    const withoutDepartment = isDepartmentHead(role) ? selectedPeople.filter(u => !u.departmentId).length : 0;
    runBulk(
      { role },
      {
        title: `Change ${peopleCount(n)} to ${meta.label}?`,
        description: `${meta.description} This changes what they can see.${withoutDepartment > 0 ? ` ${peopleCount(withoutDepartment)} ${withoutDepartment === 1 ? 'has' : 'have'} no department yet, so they won’t see a team.` : ''}`,
        confirmLabel: 'Change role',
        done: `Changed ${peopleCount(n)} to ${meta.label}`,
      },
    );
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingUser(null);
  };

  const preloadForm = useCallback(() => { void loadUserForm(); }, []);

  const hasData = allUsers !== undefined;
  const resultText = list.hasFilters ? `${filtered.length} of ${peopleCount(users.length)}` : null;

  const renderCard = (u: AdminUser) => {
    const presence = presenceById.get(u.id);
    return (
      <UserCard
        key={u.id}
        user={u}
        departmentName={u.departmentId ? departmentNames.get(u.departmentId) : undefined}
        storeName={u.storeId ? storeNames.get(u.storeId) : undefined}
        online={presence?.online}
        presenceText={presenceLabel(presence)}
        score={scores.byId ? (scores.byId.get(u.id) ?? null) : scores.failed ? null : undefined}
        scoreWindow={scoreWindow}
        busy={busyId === u.id}
        isSelf={u.id === me?.id}
        onEdit={handleEdit}
        onResetPassword={handleResetPassword}
        onDeactivate={handleDeactivate}
        onReactivate={handleReactivate}
        onDelete={handleDelete}
      />
    );
  };

  const renderContent = () => {
    if (isPending) return view === 'table' ? <UserTableSkeleton /> : <UserGridSkeleton />;

    if (!hasData) {
      return <InlineError message="We couldn’t load your people just now. Check your connection and try again." onRetry={() => refetch()} />;
    }

    if (filtered.length === 0) {
      return users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No people yet"
          description="Add the first person to get started."
          action={{ label: 'Add a person', icon: Plus, onClick: () => setShowForm(true) }}
        />
      ) : (
        <EmptyState
          icon={SearchX}
          title="No one matches"
          description="Try a different search or clear the filters."
          action={{ label: 'Clear filters', onClick: list.clearFilters }}
        />
      );
    }

    return (
      <>
        {isError && <InlineError message="We couldn’t refresh the list. You are seeing the last version we loaded." onRetry={() => refetch()} />}
        {view === 'table' ? (
          <UserTable
            users={pageRows}
            departmentNames={departmentNames}
            storeNames={storeNames}
            presenceById={presenceById}
            selectedIds={selectedIds}
            busyId={busyId}
            selfId={me?.id}
            sort={list.sort}
            dir={list.dir}
            onSort={list.toggleSort}
            onToggleSelect={toggleSelect}
            onTogglePage={togglePage}
            onEdit={handleEdit}
            onResetPassword={handleResetPassword}
            onDeactivate={handleDeactivate}
            onReactivate={handleReactivate}
            onDelete={handleDelete}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
            {pageRows.map(renderCard)}
          </div>
        )}
      </>
    );
  };

  const activeModal = showForm || editingUser;

  return (
    <div className="flex flex-col gap-3">
      <UserToolbar
        searchText={list.searchText}
        onSearchText={list.setSearchText}
        filters={filters}
        onFilters={list.setFilters}
        counts={list.counts}
        sort={list.sort}
        dir={list.dir}
        onSort={list.setSort}
        view={view}
        onView={list.setView}
        hasFilters={list.hasFilters}
        onClear={list.clearFilters}
        departmentOptions={departmentOptions}
        storeOptions={storeOptions}
        shownCount={filtered.length}
        totalPeople={users.length}
        resultText={resultText}
        onNew={() => setShowForm(true)}
        onPreloadForm={preloadForm}
        exportMenu={
          <ExportMenu
            iconOnly
            disabled={filtered.length === 0}
            aria-label="Export the people in this list"
            filename="people"
            sheetName="People"
            title={exportTitle({ what: 'People', filters: { Search: list.searchText.trim() || null } })}
            getRows={exportRows}
          />
        }
      />

      {renderContent()}

      <PageNav page={list.page} totalPages={list.totalPages} onPageChange={list.setPage} className="pt-1" />

      {view === 'table' && selectedPeople.length > 0 && (
        <BulkBar
          count={selectedPeople.length}
          departments={departments ?? []}
          stores={stores ?? []}
          disabled={bulkMut.isPending}
          onMoveDepartment={moveDepartment}
          onMoveStore={moveStore}
          onChangeRole={changeRole}
          onClear={clearSelection}
        />
      )}

      {activeModal && (
        <Suspense fallback={<FormChunkFallback />}>
          <UserForm onClose={closeForm} user={editingUser ?? undefined} />
        </Suspense>
      )}

      {offboarding && (
        <OffboardDialog
          user={offboarding}
          people={users}
          departmentName={offboarding.departmentId ? departmentNames.get(offboarding.departmentId) : undefined}
          onClose={() => setOffboarding(null)}
        />
      )}

      {resetting && <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
};
