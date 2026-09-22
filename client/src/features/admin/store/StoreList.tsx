import { useState, useMemo, lazy, Suspense } from 'react';
import { Plus, Store as StoreIcon, AlertCircle, Inbox } from 'lucide-react';
import { Button, Loader, FormLoadError, PageNav, EntityStatusFilter, EntityCardSkeleton, type EntityStatusFilterValue, useConfirm } from '../../../components';
import { useStoresQuery } from '../../tickets/hook';
import { useUsersQuery, useUpdateStoreMutation, useDeleteStoreMutation } from '../hook';
import { StoreCard } from './StoreCard';
import type { Store } from '../../../api/stores';

const PAGE_SIZE = 24;

// Lazy-loaded modal chunk — matches UserForm/DepartmentForm's own code-splitting (and its
// chunk-load-failure fallback), which this was the one entity form left out of.
const StoreForm = lazy(() =>
  import('./StoreForm').then(module => ({ default: module.StoreForm })).catch(() => ({
    default: FormLoadError,
  }))
);

export const StoreList = () => {
  const [showForm, setShowForm] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<EntityStatusFilterValue>('all');

  // Filtering/pagination moved client-side (full roster, not a server page) so the Active/
  // Inactive split can be seen and filtered at all.
  const { data: allStores, isPending, isError, refetch } = useStoresQuery();
  const stores = useMemo(() => allStores ?? [], [allStores]);
  const { data: users } = useUsersQuery();
  const updateMut = useUpdateStoreMutation();
  const deleteMut = useDeleteStoreMutation();
  const confirm = useConfirm();

  const memberCounts = useMemo(() => {
    const counts = new Map<string, number>();
    (users ?? []).forEach(u => {
      if (u.storeId) counts.set(u.storeId, (counts.get(u.storeId) ?? 0) + 1);
    });
    return counts;
  }, [users]);

  const statusCounts = useMemo(() => ({
    all: stores.length,
    active: stores.filter(s => s.isActive).length,
    inactive: stores.filter(s => !s.isActive).length,
  }), [stores]);

  const filteredStores = useMemo(() => {
    if (statusFilter === 'all') return stores;
    return stores.filter(s => s.isActive === (statusFilter === 'active'));
  }, [stores, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredStores.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStores = filteredStores.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const changeStatusFilter = (value: EntityStatusFilterValue) => {
    setStatusFilter(value);
    setPage(1);
  };

  const toggleActive = (id: string, isActive: boolean) => {
    updateMut.mutate({ id, payload: { isActive: !isActive } });
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingStore(null);
  };

  const handleDelete = async (store: Store) => {
    const ok = await confirm({
      title: `Delete ${store.name}?`,
      description: 'This permanently removes the store. This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (ok) deleteMut.mutate(store.id);
  };

  const activeModal = showForm || editingStore;

  // Single-function state renderer — matches UserList/DepartmentList's pattern instead of four
  // independent top-level conditionals, where it's harder to see at a glance that the branches
  // are mutually exclusive (and a future edit to one guard's condition without updating the
  // others could show two panels at once).
  const renderContent = () => {
    if (isPending) return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
        {Array.from({ length: 3 }).map((_, i) => <EntityCardSkeleton key={i} />)}
      </div>
    );

    if (isError) return (
      <div className="flex items-center gap-3 p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm font-display font-medium">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <p className="flex-1">Failed to load stores. Please check your connection and try again.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="shrink-0 px-3 py-1.5 rounded-md text-xs font-display font-semibold border border-danger/30 hover:bg-danger/10 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
        >
          Retry
        </button>
      </div>
    );

    if (filteredStores.length === 0) return (
      <section className="flex flex-col items-center justify-center py-20 px-4 rounded-3xl border-2 border-dashed border-border bg-surface-hover/40 text-center">
        <div className="flex items-center justify-center mb-5 size-14 rounded-full bg-surface border border-border text-text-muted">
          <Inbox className="w-6 h-6" strokeWidth={1.5} />
        </div>
        <h3 className="text-lg font-display font-bold text-text mb-2">
          {statusFilter === 'all' ? 'No stores yet' : `No ${statusFilter} stores`}
        </h3>
        <p className="text-sm text-text-muted max-w-sm mb-8">
          {statusFilter === 'all'
            ? 'Add your first store before creating recurring checklists — every checklist template deploys to one or more stores.'
            : 'Switch to "All" to see everyone, or adjust the filter.'}
        </p>
        {statusFilter === 'all' && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="press-feedback inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-display font-bold rounded-xl shadow-sm bg-surface text-text-secondary border border-border transition-all duration-300 hover:bg-surface-hover hover:text-primary-600 hover:border-primary-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            <StoreIcon className="w-3.5 h-3.5" />
            Create store
          </button>
        )}
      </section>
    );

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
        {pageStores.map(s => (
          <StoreCard
            key={s.id}
            store={s}
            memberCount={memberCounts.get(s.id) ?? 0}
            isUpdating={updateMut.isPending && updateMut.variables?.id === s.id}
            isDeleting={deleteMut.isPending && deleteMut.variables === s.id}
            onToggleActive={toggleActive}
            onEdit={setEditingStore}
            onDelete={() => handleDelete(s)}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <EntityStatusFilter value={statusFilter} onChange={changeStatusFilter} counts={statusCounts} />
        <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
          <Plus className="w-3.5 h-3.5" />
          New store
        </Button>
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
          <StoreForm onClose={closeForm} store={editingStore ?? undefined} />
        </Suspense>
      )}
    </div>
  );
};
