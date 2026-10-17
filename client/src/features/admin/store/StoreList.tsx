import { useState, useMemo, useCallback, lazy, Suspense } from 'react';
import { Plus, Store as StoreIcon, ArrowDownAZ, Users, Building2, type LucideIcon } from 'lucide-react';
import { OptionSection, OptionSelect } from '../../../components/optionsSheet';
import { useMediaQuery } from '../../../lib/useMediaQuery';
import { OrgStatusSection, OrgTableSkeleton, OrgToolbar } from '../directory/OrgToolbar';
import { useDirectoryView } from '../directory/useDirectoryView';
import { useMonthScores } from '../directory/orgScoreData';
import {
  EmptyState,
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
import { StoreCard, StoreCardSkeleton } from './StoreCard';
import { StoreTable } from './StoreTable';
import type { Store } from '../../../api/stores';

type SortKey = 'name' | 'staff' | 'departments';
const SORT_LABEL: Record<SortKey, string> = { name: 'Name A-Z', staff: 'Staff, most first', departments: 'Departments, most first' };
const SORT_ICON: Record<SortKey, LucideIcon> = { name: ArrowDownAZ, staff: Users, departments: Building2 };

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
  const [searchText, setSearchText] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '');
  const [sort, setSort] = useState<SortKey>('name');
  const [view, setView] = useDirectoryView();
  // Phones always get cards, whatever the shared view says.
  const isNarrow = useMediaQuery('(max-width: 639px)');
  const showTable = view === 'table' && !isNarrow;

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

  const scores = useMonthScores('store');
  const scoreWindow = useMemo(() => ({ from: scores.from, to: scores.to, failed: scores.failed }), [scores.from, scores.to, scores.failed]);

  const statusCounts = useMemo(() => ({
    all: stores.length,
    active: stores.filter(s => s.isActive).length,
    inactive: stores.filter(s => !s.isActive).length,
  }), [stores]);

  const filteredStores = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const matched = stores.filter(st => {
      if (statusFilter !== 'all' && st.isActive !== (statusFilter === 'active')) return false;
      if (!q) return true;
      return [st.name, st.code, st.address].some(v => (v ?? '').toLowerCase().includes(q));
    });
    return matched.sort((a, b) => {
      if (sort === 'staff' && memberCounts) {
        const diff = (memberCounts.get(b.id)?.active ?? 0) - (memberCounts.get(a.id)?.active ?? 0);
        if (diff !== 0) return diff;
      }
      if (sort === 'departments' && departmentCountByStore) {
        const diff = (departmentCountByStore.get(b.id) ?? 0) - (departmentCountByStore.get(a.id) ?? 0);
        if (diff !== 0) return diff;
      }
      return a.name.localeCompare(b.name);
    });
  }, [stores, statusFilter, searchText, sort, memberCounts, departmentCountByStore]);

  const totalPages = Math.max(1, Math.ceil(filteredStores.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStores = filteredStores.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const changeStatusFilter = (value: EntityStatusFilterValue) => {
    setStatusFilter(value);
    setPage(1);
  };
  const changeSearch = (value: string) => {
    setSearchText(value);
    setPage(1);
  };
  const changeSort = (value: SortKey) => {
    setSort(value);
    setPage(1);
  };
  const clearFilters = () => {
    setSearchText('');
    setStatusFilter('all');
    setPage(1);
  };
  const resetOptions = () => {
    setStatusFilter('all');
    setSort('name');
    setPage(1);
  };

  const narrowed = searchText.trim() !== '' || statusFilter !== 'all';
  const resultText = narrowed ? `${filteredStores.length} of ${stores.length} stores` : null;

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
    if (isPending) return showTable ? <OrgTableSkeleton /> : (
      <div className={GRID_CLASS}>
        {Array.from({ length: SKELETON_COUNT }).map((_, i) => <StoreCardSkeleton key={i} />)}
      </div>
    );

    if (isError && !allStores) return (
      <InlineError message="Couldn't load stores. Check your connection and try again." onRetry={() => refetch()} />
    );

    if (filteredStores.length === 0) {
      return stores.length === 0 ? (
        <EmptyState
          icon={StoreIcon}
          title="No stores yet"
          description="Add your first store before setting up recurring checklists. Every checklist runs in one or more stores."
          action={{ label: 'New store', icon: Plus, onClick: () => setShowForm(true) }}
        />
      ) : (
        <EmptyState
          icon={StoreIcon}
          title="No stores match"
          description="Try a different search or clear the filters."
          action={{ label: 'Clear filters', onClick: clearFilters }}
        />
      );
    }

    if (showTable) {
      return (
        <StoreTable
          stores={pageStores}
          memberCounts={memberCounts}
          membersFailed={usersError}
          departmentCountByStore={departmentCountByStore}
          updatingId={updateMut.isPending ? updateMut.variables?.id : undefined}
          deletingId={deleteMut.isPending ? deleteMut.variables : undefined}
          onToggleActive={toggleActive}
          onEdit={setEditingStore}
          onDelete={handleDelete}
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
              departmentCount={departmentCountByStore ? (departmentCountByStore.get(s.id) ?? 0) : undefined}
              score={scores.byId ? (scores.byId.get(s.id) ?? null) : scores.failed ? null : undefined}
              scoreWindow={scoreWindow}
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
      <OrgToolbar
        searchLabel="Search stores"
        searchPlaceholder="Search stores"
        searchText={searchText}
        onSearchText={changeSearch}
        view={view}
        onView={setView}
        newLabel="New store"
        onNew={() => setShowForm(true)}
        onPreloadForm={loadStoreForm}
        activeCount={statusFilter === 'all' ? 0 : 1}
        subtitle={`${filteredStores.length} of ${stores.length} stores`}
        showLabel={`Show ${filteredStores.length} ${filteredStores.length === 1 ? 'store' : 'stores'}`}
        canReset={statusFilter !== 'all' || sort !== 'name'}
        onReset={resetOptions}
        resultText={resultText}
        onClearFilters={clearFilters}
      >
        <OrgStatusSection value={statusFilter} onChange={changeStatusFilter} counts={statusCounts} />
        <OptionSection icon={ArrowDownAZ} label="Sort by">
          <OptionSelect labels={SORT_LABEL} icons={SORT_ICON} value={sort} onChange={changeSort} />
        </OptionSection>
      </OrgToolbar>

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
