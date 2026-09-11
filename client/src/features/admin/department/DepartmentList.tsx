import { useState, useMemo, lazy, Suspense } from "react";
import { Plus, AlertCircle, Inbox } from "lucide-react";

import type { Department } from "../../../api/departments";
import { DepartmentCard } from "./DepartmentCard";
import {
  useUsersQuery,
  useUpdateDepartmentMutation,
  useDeleteDepartmentMutation,
} from "../hook";
import { useDepartmentsQuery, useStoresQuery } from "../../tickets/hook";
import { Loader, FormLoadError, PageNav, EntityStatusFilter, EntityCardSkeleton, type EntityStatusFilterValue, useConfirm } from "../../../components";

const PAGE_SIZE = 24;

const DepartmentForm = lazy(() =>
  import("./DepartmentForm").then(module => ({ default: module.DepartmentForm })).catch(() => ({
    default: FormLoadError,
  }))
);

const DepartmentGridSkeleton = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
    {Array.from({ length: 6 }).map((_, i) => <EntityCardSkeleton key={i} />)}
  </div>
);


export const DepartmentList = () => {
  const [showForm, setShowForm] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<EntityStatusFilterValue>('all');

  // Filtering/pagination moved client-side (full roster, not a server page) so the Active/
  // Inactive split can be seen and filtered at all.
  const { data: allDepartments, isPending, isError, refetch } = useDepartmentsQuery();
  const departments = useMemo(() => allDepartments ?? [], [allDepartments]);
  const { data: users } = useUsersQuery();
  const { data: stores } = useStoresQuery();
  const updateMut = useUpdateDepartmentMutation();
  const deleteMut = useDeleteDepartmentMutation();
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

  // Optimized O(N) counter using useMemo
  const memberCounts = useMemo(() => {
    const counts = new Map<string, number>();
    (users ?? []).forEach(u => {
      if (u.departmentId) {
        counts.set(u.departmentId, (counts.get(u.departmentId) ?? 0) + 1);
      }
    });
    return counts;
  }, [users]);

  const storeNameById = useMemo(() => {
    const names = new Map<string, string>();
    (stores ?? []).forEach(s => names.set(s.id, s.name));
    return names;
  }, [stores]);

  const toggleActive = (id: string, isActive: boolean) => {
    updateMut.mutate({ id, payload: { isActive: !isActive } });
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingDepartment(null);
  };

  const handleDelete = async (department: Department) => {
    const ok = await confirm({
      title: `Delete ${department.name}?`,
      description: 'This permanently removes the department. This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (ok) deleteMut.mutate(department.id);
  };

  // Pattern matching view renderer
  const renderContent = () => {
    if (isPending) {
      return <DepartmentGridSkeleton />;
    }

    if (isError) {
      return (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm font-display font-medium">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="flex-1">Failed to load departments. Please check your connection and try again.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="shrink-0 px-3 py-1.5 rounded-md text-xs font-display font-semibold border border-danger/30 hover:bg-danger/10 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
          >
            Retry
          </button>
        </div>
      );
    }

    if (filteredDepartments.length === 0) {
      return (
        <section className="flex flex-col items-center justify-center py-20 px-4 rounded-3xl border-2 border-dashed border-border bg-surface-hover/40 text-center">
          <div className="mb-5 text-text-muted">
            <Inbox className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-display font-bold text-text mb-2">
            {statusFilter === 'all' ? 'No departments yet' : `No ${statusFilter} departments`}
          </h3>
          <p className="text-sm text-text-muted max-w-sm mb-8">
            {statusFilter === 'all'
              ? 'Departments help you group users and scope checklist assignments. Get started by creating your first one.'
              : 'Switch to "All" to see everyone, or adjust the filter.'}
          </p>
          {statusFilter === 'all' && (
            <button
              onClick={() => setShowForm(true)}
              className="press-feedback inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-display font-bold rounded-xl shadow-sm bg-surface text-text-secondary border border-border transition-all duration-300 hover:bg-surface-hover hover:text-primary-600 hover:border-primary-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
              <Plus className="w-3.5 h-3.5" />
              Create department
            </button>
          )}
        </section>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
        {pageDepartments.map(d => (
          <DepartmentCard
            key={d.id}
            department={d}
            storeName={d.storeId ? storeNameById.get(d.storeId) : undefined}
            memberCount={memberCounts.get(d.id) ?? 0}
            isUpdating={updateMut.isPending && updateMut.variables?.id === d.id}
            isDeleting={deleteMut.isPending && deleteMut.variables === d.id}
            onToggleActive={toggleActive}
            onEdit={setEditingDepartment}
            onDelete={() => handleDelete(d)}
          />
        ))}
      </div>
    );
  };

  const activeModal = showForm || editingDepartment;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <EntityStatusFilter value={statusFilter} onChange={changeStatusFilter} counts={statusCounts} />

        <button
          onClick={() => setShowForm(true)}
          className="press-feedback group inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-display font-bold text-white rounded-xl shadow-sm bg-primary-700 hover:bg-primary-800 transition-all duration-300 ease-in-out hover:scale-[1.02] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 active:scale-[0.98]"
        >
          <Plus className="w-3.5 h-3.5 transition-transform duration-300 group-hover:rotate-90" />
          New department
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
          <DepartmentForm
            onClose={closeForm}
            department={editingDepartment ?? undefined}
          />
        </Suspense>
      )}
    </div>
  );
};
