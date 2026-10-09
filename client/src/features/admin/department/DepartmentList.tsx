import { useState, useMemo, useCallback, lazy, Suspense } from "react";
import { Plus, Inbox, ArrowDownAZ, Users, type LucideIcon } from "lucide-react";

import type { Department } from "../../../api/departments";
import { DepartmentCard, DepartmentCardSkeleton } from "./DepartmentCard";
import { DepartmentTable } from "./DepartmentTable";
import {
  useUsersQuery,
  useUpdateDepartmentMutation,
  useDeleteDepartmentMutation,
} from "../hook";
import { useDepartmentsQuery, useStoresQuery } from "../../tickets/hook";
import { countPeopleBy, hasPeople, peopleText } from "../orgCounts";
import { OptionSection, OptionSelect } from "../../../components/optionsSheet";
import { useMediaQuery } from "../../../lib/useMediaQuery";
import { OrgStatusSection, OrgTableSkeleton, OrgToolbar } from "../directory/OrgToolbar";
import { useDirectoryView } from "../directory/useDirectoryView";
import {
  EmptyState,
  FormChunkFallback,
  FormLoadError,
  InlineError,
  PageNav,
  useConfirm,
  type EntityStatusFilterValue,
} from "../../../components";

type SortKey = "name" | "members";
const SORT_LABEL: Record<SortKey, string> = { name: "Name A-Z", members: "Members, most first" };
const SORT_ICON: Record<SortKey, LucideIcon> = { name: ArrowDownAZ, members: Users };

const PAGE_SIZE = 24;
const SKELETON_COUNT = 6;
const GRID_CLASS = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3";

// Kept as a named function so hovering/focusing "New department" can start the download early.
const loadDepartmentForm = () => import("./DepartmentForm");

const DepartmentForm = lazy(() =>
  loadDepartmentForm().then(module => ({ default: module.DepartmentForm })).catch(() => ({
    default: FormLoadError,
  }))
);

export const DepartmentList = () => {
  const [showForm, setShowForm] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
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
  const { data: allDepartments, isPending, isError, refetch } = useDepartmentsQuery();
  const departments = useMemo(() => allDepartments ?? [], [allDepartments]);
  const { data: users, isError: usersError, refetch: refetchUsers } = useUsersQuery();
  const { data: stores } = useStoresQuery();
  const updateMut = useUpdateDepartmentMutation();
  const deleteMut = useDeleteDepartmentMutation();
  const { mutate: updateDepartment } = updateMut;
  const { mutate: deleteDepartment } = deleteMut;
  const confirm = useConfirm();

  const statusCounts = useMemo(() => ({
    all: departments.length,
    active: departments.filter(d => d.isActive).length,
    inactive: departments.filter(d => !d.isActive).length,
  }), [departments]);

  // undefined until the roster arrives, so a card never claims "0 members" while it is still loading.
  const memberCounts = useMemo(() => (users ? countPeopleBy(users, 'departmentId') : undefined), [users]);

  const storeNameById = useMemo(() => {
    const names = new Map<string, string>();
    (stores ?? []).forEach(s => names.set(s.id, s.name));
    return names;
  }, [stores]);

  const filteredDepartments = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const matched = departments.filter(d => {
      if (statusFilter !== 'all' && d.isActive !== (statusFilter === 'active')) return false;
      if (!q) return true;
      return d.name.toLowerCase().includes(q) || (d.storeId ? (storeNameById.get(d.storeId) ?? '').toLowerCase().includes(q) : false);
    });
    return matched.sort((a, b) => {
      if (sort === 'members' && memberCounts) {
        const diff = (memberCounts.get(b.id)?.active ?? 0) - (memberCounts.get(a.id)?.active ?? 0);
        if (diff !== 0) return diff;
      }
      return a.name.localeCompare(b.name);
    });
  }, [departments, statusFilter, searchText, sort, memberCounts, storeNameById]);

  const totalPages = Math.max(1, Math.ceil(filteredDepartments.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageDepartments = filteredDepartments.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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
  const resultText = narrowed ? `${filteredDepartments.length} of ${departments.length} departments` : null;

  const toggleActive = useCallback(async (department: Department) => {
    if (department.isActive) {
      const ok = await confirm({
        title: `Deactivate ${department.name}?`,
        description: 'It will be hidden from pickers. People and past records stay as they are.',
        confirmLabel: 'Deactivate',
        variant: 'danger',
      });
      if (!ok) return;
    }
    updateDepartment({ id: department.id, payload: { isActive: !department.isActive } });
  }, [confirm, updateDepartment]);

  const handleDelete = useCallback(async (department: Department) => {
    const count = memberCounts?.get(department.id);

    // Not empty: deleting would strand people, so the only forward step offered is deactivating.
    if (count && hasPeople(count)) {
      const total = count.active + count.inactive;
      const stranded = `${peopleText(count)} ${total === 1 ? 'is' : 'are'} in this department. Move them first, or they will be left without one.`;
      if (department.isActive) {
        const ok = await confirm({
          title: `${department.name} still has people`,
          description: `${stranded} You can deactivate it instead to hide it from pickers.`,
          confirmLabel: 'Deactivate instead',
          cancelLabel: 'Close',
        });
        if (ok) updateDepartment({ id: department.id, payload: { isActive: false } });
      } else {
        await confirm({
          title: `${department.name} still has people`,
          description: stranded,
          confirmLabel: 'Got it',
          cancelLabel: 'Close',
        });
      }
      return;
    }

    const ok = await confirm({
      title: `Delete ${department.name}?`,
      description: count
        ? 'Nobody is in this department. This permanently removes it and cannot be undone.'
        : 'This permanently removes the department and cannot be undone. If people are still in it, we will let you know.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (ok) deleteDepartment(department.id);
  }, [memberCounts, confirm, updateDepartment, deleteDepartment]);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingDepartment(null);
  }, []);

  const renderContent = () => {
    // Skeleton only while there is nothing to show; a background refetch keeps the list on screen.
    if (isPending) {
      if (showTable) return <OrgTableSkeleton />;
      return (
        <div className={GRID_CLASS}>
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => <DepartmentCardSkeleton key={i} />)}
        </div>
      );
    }

    if (isError && !allDepartments) {
      return <InlineError message="Couldn't load departments. Check your connection and try again." onRetry={() => refetch()} />;
    }

    if (filteredDepartments.length === 0) {
      return departments.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No departments yet"
          description="Departments group your people and decide who sees which checklists. Create the first one to get started."
          action={{ label: 'New department', icon: Plus, onClick: () => setShowForm(true) }}
        />
      ) : (
        <EmptyState
          icon={Inbox}
          title="No departments match"
          description="Try a different search or clear the filters."
          action={{ label: 'Clear filters', onClick: clearFilters }}
        />
      );
    }

    if (showTable) {
      return (
        <DepartmentTable
          departments={pageDepartments}
          storeNameById={stores ? storeNameById : undefined}
          memberCounts={memberCounts}
          membersFailed={usersError}
          updatingId={updateMut.isPending ? updateMut.variables?.id : undefined}
          deletingId={deleteMut.isPending ? deleteMut.variables : undefined}
          onToggleActive={toggleActive}
          onEdit={setEditingDepartment}
          onDelete={handleDelete}
        />
      );
    }

    return (
      <div className={GRID_CLASS}>
        {pageDepartments.map(d => {
          const count = memberCounts?.get(d.id);
          return (
            <DepartmentCard
              key={d.id}
              department={d}
              storeLabel={d.storeId ? (stores ? (storeNameById.get(d.storeId) ?? 'Unknown store') : undefined) : null}
              activeCount={memberCounts ? (count?.active ?? 0) : usersError ? null : undefined}
              inactiveCount={count?.inactive ?? 0}
              isUpdating={updateMut.isPending && updateMut.variables?.id === d.id}
              isDeleting={deleteMut.isPending && deleteMut.variables === d.id}
              onToggleActive={toggleActive}
              onEdit={setEditingDepartment}
              onDelete={handleDelete}
            />
          );
        })}
      </div>
    );
  };

  const activeModal = showForm || editingDepartment;

  return (
    <div className="flex flex-col gap-3">
      <OrgToolbar
        searchLabel="Search departments"
        searchPlaceholder="Search departments"
        searchText={searchText}
        onSearchText={changeSearch}
        view={view}
        onView={setView}
        newLabel="New department"
        onNew={() => setShowForm(true)}
        onPreloadForm={loadDepartmentForm}
        activeCount={statusFilter === 'all' ? 0 : 1}
        subtitle={`${filteredDepartments.length} of ${departments.length} departments`}
        showLabel={`Show ${filteredDepartments.length} ${filteredDepartments.length === 1 ? 'department' : 'departments'}`}
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
      {isError && allDepartments && (
        <InlineError message="Couldn't refresh departments. Showing the last list we loaded." onRetry={() => refetch()} />
      )}
      {usersError && !users && (
        <InlineError message="Member counts aren't loading." onRetry={() => refetchUsers()} />
      )}

      {renderContent()}

      {totalPages > 1 && (
        <PageNav page={safePage} totalPages={totalPages} onPageChange={setPage} className="pt-1" />
      )}

      {activeModal && (
        <Suspense fallback={<FormChunkFallback />}>
          <DepartmentForm
            onClose={closeForm}
            department={editingDepartment ?? undefined}
          />
        </Suspense>
      )}
    </div>
  );
};
