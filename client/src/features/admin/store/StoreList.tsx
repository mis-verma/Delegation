import { useState, useMemo, useCallback, lazy, Suspense } from 'react';
import { Plus, Store as StoreIcon } from 'lucide-react';
import {
  Button,
  EmptyState,
  EntityCardSkeleton,
  EntityStatusFilter,
  FormChunkFallback,
  FormLoadError,
  InlineError,
  PageNav,
  useConfirm,
  type EntityStatusFilterValue,
} from '../../../components';
import { useDepartmentsQuery, useStoresQuery } from '../../tickets/hook';
import { useUsersQuery, useUpdateStoreMutation, useDeleteStoreMutation } from '../hook';
import { countPeopleBy, hasPeople, peopleText } from '../orgCounts';
import { StoreCard } from './StoreCard';
import type { Store } from '../../../api/stores';

const PAGE_SIZE = 24;
const SKELETON_COUNT = 6;
const GRID_CLASS = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3';

// Named so hovering/focusing "New store" can start the chunk download early.
const loadStoreForm = () => import('./StoreForm');

// Lazy-loaded modal chunk, same code-splitting (and chunk-load-failure fallback) as UserForm/DepartmentForm.
const StoreForm = lazy(() =>
  loadStoreForm().then(module => ({ default: module.StoreForm })).catch(() => ({
    default: FormLoadError,
  }))
);

export const StoreList = () => {
  const [showForm, setShowForm] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<EntityStatusFilterValue>('all');

  // Filtering/pagination is client-side (full roster, not a server page) so the Active/Inactive
  // split can be seen and filtered at all.
  const { data: allStores, isPending, isError, refetch } = useStoresQuery();
  const stores = useMemo(() => allStores ?? [], [allStores]);
  const { data: users, isError: usersError, refetch: refetchUsers } = useUsersQuery();
  const { data: departments } = useDepartmentsQuery();
  const updateMut = useUpdateStoreMutation();
  const deleteMut = useDeleteStoreMutation();
  const { mutate: updateStore } = updateMut;
  const { mutate: deleteStore } = deleteMut;
  const confirm = useConfirm();

  // undefined until the roster arrives, so a card never claims "0 staff" while it is still loading.
  const memberCounts = useMemo(() => (users ? countPeopleBy(users, 'storeId') : undefined), [users]);

  const departmentCountByStore = useMemo(() => {
    if (!departments) return undefined;
    const counts = new Map<string, number>();
    departments.forEach(d => {
      if (d.storeId) counts.set(d.storeId, (counts.get(d.storeId) ?? 0) + 1);
    });
    return counts;
  }, [departments]);

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

  const toggleActive = useCallback(async (store: Store) => {
    if (store.isActive) {
      const ok = await confirm({
        title: `Deactivate ${store.name}?`,
        description: 'It will be hidden from pickers and left out of checklist reports. People and past records stay as they are.',
        confirmLabel: 'Deactivate',
        variant: 'danger',
      });
      if (!ok) return;
    }
    updateStore({ id: store.id, payload: { isActive: !store.isActive } });
  }, [confirm, updateStore]);

  const handleDelete = useCallback(async (store: Store) => {
    const people = memberCounts?.get(store.id);
    const deptCount = departmentCountByStore?.get(store.id) ?? 0;
    const peopleKnown = !!memberCounts && !!departmentCountByStore;

    // Not empty: deleting would strand departments and people, so the only forward step is deactivating.
    if ((people && hasPeople(people)) || deptCount > 0) {
      const parts: string[] = [];
      if (deptCount > 0) parts.push(`${deptCount} ${deptCount === 1 ? 'department' : 'departments'}`);
      if (people && hasPeople(people)) parts.push(peopleText(people));
      const held = `${store.name} still has ${parts.join(' and ')}. Move them first.`;
      if (store.isActive) {
        const ok = await confirm({
          title: `${store.name} is not empty`,
          description: `${held} Or deactivate the store to hide it from pickers.`,
          confirmLabel: 'Deactivate instead',
          cancelLabel: 'Close',
        });
        if (ok) updateStore({ id: store.id, payload: { isActive: false } });
      } else {
        await confirm({
          title: `${store.name} is not empty`,
          description: held,
          confirmLabel: 'Got it',
          cancelLabel: 'Close',
        });
      }
      return;
    }

    const ok = await confirm({
      title: `Delete ${store.name}?`,
      description: peopleKnown
        ? 'No departments or people are tied to this store. This permanently removes it and cannot be undone.'
        : 'This permanently removes the store and cannot be undone. If departments or people are still tied to it, we will let you know.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (ok) deleteStore(store.id);
  }, [memberCounts, departmentCountByStore, confirm, updateStore, deleteStore]);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingStore(null);
  }, []);

  const activeModal = showForm || editingStore;

  const renderContent = () => {
    // Skeleton only while there is nothing to show; a background refetch keeps the list on screen.
    if (isPending) return (
      <div className={GRID_CLASS}>
        {Array.from({ length: SKELETON_COUNT }).map((_, i) => <EntityCardSkeleton key={i} />)}
      </div>
    );

    if (isError && !allStores) return (
      <InlineError message="Couldn't load stores. Check your connection and try again." onRetry={() => refetch()} />
    );

    if (filteredStores.length === 0) {
      return statusFilter === 'all' ? (
        <EmptyState
          icon={StoreIcon}
          title="No stores yet"
          description="Add your first store before setting up recurring checklists. Every checklist runs in one or more stores."
          action={{ label: 'New store', icon: Plus, onClick: () => setShowForm(true) }}
        />
      ) : (
        <EmptyState
          icon={StoreIcon}
          title={`No ${statusFilter} stores`}
          description="No store matches this filter right now."
          action={{ label: 'Show all stores', onClick: () => changeStatusFilter('all') }}
        />
      );
    }

    return (
      <div className={GRID_CLASS}>
        {pageStores.map(s => {
          const count = memberCounts?.get(s.id);
          return (
            <StoreCard
              key={s.id}
              store={s}
              activeCount={memberCounts ? (count?.active ?? 0) : usersError ? null : undefined}
              inactiveCount={count?.inactive ?? 0}
              isUpdating={updateMut.isPending && updateMut.variables?.id === s.id}
              isDeleting={deleteMut.isPending && deleteMut.variables === s.id}
              onToggleActive={toggleActive}
              onEdit={setEditingStore}
              onDelete={handleDelete}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <EntityStatusFilter value={statusFilter} onChange={changeStatusFilter} counts={statusCounts} />
        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowForm(true)}
          onMouseEnter={loadStoreForm}
          onFocus={loadStoreForm}
        >
          <Plus className="w-3.5 h-3.5" />
          New store
        </Button>
      </div>

      {/* A failed refresh never hides the list; it just says so. */}
      {isError && allStores && (
        <InlineError message="Couldn't refresh stores. Showing the last list we loaded." onRetry={() => refetch()} />
      )}
      {usersError && !users && (
        <InlineError message="Staff counts aren't loading." onRetry={() => refetchUsers()} />
      )}

      {renderContent()}

      {totalPages > 1 && (
        <PageNav page={safePage} totalPages={totalPages} onPageChange={setPage} className="pt-1" />
      )}

      {activeModal && (
        <Suspense fallback={<FormChunkFallback />}>
          <StoreForm onClose={closeForm} store={editingStore ?? undefined} />
        </Suspense>
      )}
    </div>
  );
};
