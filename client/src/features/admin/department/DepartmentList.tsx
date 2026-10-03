import { useState, useMemo, useCallback, lazy, Suspense } from "react";
import { Plus, Inbox } from "lucide-react";

import type { Department } from "../../../api/departments";
import { DepartmentCard } from "./DepartmentCard";
import {
  useUsersQuery,
  useUpdateDepartmentMutation,
  useDeleteDepartmentMutation,
} from "../hook";
import { useDepartmentsQuery, useStoresQuery } from "../../tickets/hook";
import { countPeopleBy, hasPeople, peopleText } from "../orgCounts";
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
} from "../../../components";

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

  const filteredDepartments = useMemo(() => {
    if (statusFilter === 'all') return departments;
    return departments.filter(d => d.isActive === (statusFilter === 'active'));
  }, [departments, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredDepartments.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageDepartments = filteredDepartments.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const changeStatusFilter = (value: EntityStatusFilterValue) => {
    setStatusFilter(value);
    setPage(1);
  };

  // undefined until the roster arrives, so a card never claims "0 members" while it is still loading.
  const memberCounts = useMemo(() => (users ? countPeopleBy(users, 'departmentId') : undefined), [users]);

  const storeNameById = useMemo(() => {
    const names = new Map<string, string>();
    (stores ?? []).forEach(s => names.set(s.id, s.name));
    return names;
  }, [stores]);

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
      return (
        <div className={GRID_CLASS}>
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => <EntityCardSkeleton key={i} />)}
        </div>
      );
    }

    if (isError && !allDepartments) {
      return <InlineError message="Couldn't load departments. Check your connection and try again." onRetry={() => refetch()} />;
    }

    if (filteredDepartments.length === 0) {
      return statusFilter === 'all' ? (
        <EmptyState
          icon={Inbox}
          title="No departments yet"
          description="Departments group your people and decide who sees which checklists. Create the first one to get started."
          action={{ label: 'New department', icon: Plus, onClick: () => setShowForm(true) }}
        />
      ) : (
        <EmptyState
          icon={Inbox}
          title={`No ${statusFilter} departments`}
          description="No department matches this filter right now."
          action={{ label: 'Show all departments', onClick: () => changeStatusFilter('all') }}
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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <EntityStatusFilter value={statusFilter} onChange={changeStatusFilter} counts={statusCounts} />

        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowForm(true)}
          onMouseEnter={loadDepartmentForm}
          onFocus={loadDepartmentForm}
          className="group"
        >
          <Plus className="w-3.5 h-3.5 transition-transform duration-300 group-hover:rotate-90" />
          New department
        </Button>
      </div>

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
