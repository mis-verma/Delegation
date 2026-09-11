import { useState, useMemo, lazy, Suspense } from 'react';
import { Plus, AlertCircle, Inbox } from 'lucide-react';
import type { AdminUser } from '../../../api/admin';
import {
  useUsersQuery,
  useDepartmentsQuery,
  useUpdateUserMutation,
  useDeleteUserMutation,
} from '../hook';
import { UserCard } from './UserCard';
import { Loader, FormLoadError, PageNav, EntityStatusFilter, EntityCardSkeleton, type EntityStatusFilterValue, useConfirm } from '../../../components';

const PAGE_SIZE = 24;

// Lazy-loaded modal chunk
const UserForm = lazy(() =>
  import('./UserForm').then(module => ({ default: module.UserForm })).catch(() => ({
    default: FormLoadError,
  }))
);

// --- Subcomponents ---
const UserGridSkeleton = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
    {Array.from({ length: 6 }).map((_, i) => <EntityCardSkeleton key={i} />)}
  </div>
);

// --- Main Component ---
export const UserList = () => {
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<EntityStatusFilterValue>('all');

  // Filtering/pagination moved client-side (full roster, not a server page) so the Active/
  // Inactive split can be seen and filtered at all — the paginated endpoint had no status filter,
  // so "who's inactive" was only discoverable by scrolling every page and reading each card.
  const { data: allUsers, isPending, isError, refetch } = useUsersQuery();
  const users = useMemo(() => allUsers ?? [], [allUsers]);
  const { data: departments } = useDepartmentsQuery();
  const updateMut = useUpdateUserMutation();
  const deleteMut = useDeleteUserMutation();
  const confirm = useConfirm();

  const departmentNames = useMemo(
    () => new Map((departments ?? []).map(d => [d.id, d.name])),
    [departments]
  );

  const statusCounts = useMemo(() => ({
    all: users.length,
    active: users.filter(u => u.isActive).length,
    inactive: users.filter(u => !u.isActive).length,
  }), [users]);

  const filteredUsers = useMemo(() => {
    if (statusFilter === 'all') return users;
    return users.filter(u => u.isActive === (statusFilter === 'active'));
  }, [users, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageUsers = filteredUsers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const changeStatusFilter = (value: EntityStatusFilterValue) => {
    setStatusFilter(value);
    setPage(1);
  };

  const toggleActive = (id: string, isActive: boolean) => {
    updateMut.mutate({ id, payload: { isActive: !isActive } });
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingUser(null);
  };

  const handleDelete = async (user: AdminUser) => {
    const ok = await confirm({
      title: `Delete ${user.firstName} ${user.lastName ?? ''}?`,
      description: 'This permanently removes their account. This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (ok) deleteMut.mutate(user.id);
  };

  const renderContent = () => {
    if (isPending) return <UserGridSkeleton />;

    if (isError) return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm font-display font-medium">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <p className="flex-1">Failed to load users. Please check your connection and try again.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="shrink-0 px-3 py-1.5 rounded-md text-xs font-display font-semibold border border-danger/30 hover:bg-danger/10 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
        >
          Retry
        </button>
      </div>
    );

    if (filteredUsers.length === 0) return (
      <section className="flex flex-col items-center justify-center py-20 px-4 rounded-3xl border-2 border-dashed border-border bg-surface-hover/40 text-center">
        <div className="mb-5 text-text-muted">
          <Inbox className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-display font-bold text-text mb-2">
          {statusFilter === 'all' ? 'No users found' : `No ${statusFilter} users`}
        </h3>
        <p className="text-sm text-text-muted max-w-sm mb-8">
          {statusFilter === 'all'
            ? "You haven't added any users to your organization yet. Create your first user to get started."
            : `Switch to "All" to see everyone, or adjust the filter.`}
        </p>
        {statusFilter === 'all' && (
          <button
            onClick={() => setShowForm(true)}
            className="press-feedback inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-display font-bold rounded-xl shadow-sm bg-surface text-text-secondary border border-border transition-all duration-300 hover:bg-surface-hover hover:text-primary-600 hover:border-primary-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            <Plus className="w-3.5 h-3.5" />
            Create user
          </button>
        )}
      </section>
    );

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
        {pageUsers.map(u => (
          <UserCard
            key={u.id}
            user={u}
            departmentName={u.departmentId ? (departmentNames.get(u.departmentId) ?? 'Unknown Dept') : undefined}
            isUpdating={updateMut.isPending && updateMut.variables?.id === u.id}
            isDeleting={deleteMut.isPending && deleteMut.variables === u.id}
            onToggleActive={toggleActive}
            onEdit={setEditingUser}
            onDelete={() => handleDelete(u)}
          />
        ))}
      </div>
    );
  };

  const activeModal = showForm || editingUser;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <EntityStatusFilter value={statusFilter} onChange={changeStatusFilter} counts={statusCounts} />

        <button
          onClick={() => setShowForm(true)}
          className="press-feedback group inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-display font-bold text-white rounded-xl shadow-sm bg-primary-700 hover:bg-primary-800 transition-all duration-300 ease-in-out hover:scale-[1.02] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 active:scale-[0.98]"
        >
          <Plus className="w-3.5 h-3.5 transition-transform duration-300 group-hover:rotate-90" />
          New user
        </button>
      </div>

      {renderContent()}

      {totalPages > 1 && (
        <PageNav page={safePage} totalPages={totalPages} onPageChange={setPage} className="pt-1" />
      )}

      {activeModal && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in">
            <Loader size="xl" variant="primary" />
          </div>
        }>
          <UserForm onClose={closeForm} user={editingUser ?? undefined} />
        </Suspense>
      )}
    </div>
  );
};
