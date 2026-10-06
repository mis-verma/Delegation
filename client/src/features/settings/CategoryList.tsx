import { useState, lazy, Suspense } from "react";
import { Plus, Trash2, Pencil, Tag, Loader2, Building2, Users } from "lucide-react";
import { Button, Skeleton, GradientIconTile } from "../../components";
import { useCategoriesQuery, useDeleteCategoryMutation, useUpdateCategoryMutation } from "./hook";
import { ErrorMessage, EmptyState } from '../admin/adminDisplay';
import type { Category } from "../../api/categories";

const CategoryForm = lazy(() =>
  import("./CategoryForm").then(module => ({ default: module.CategoryForm }))
);

export const CategoryList = () => {
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const { data: categories = [], isPending, isError } = useCategoriesQuery();
  const updateMut = useUpdateCategoryMutation();
  const deleteMut = useDeleteCategoryMutation();

  const toggleActive = (id: string, isActive: boolean) => {
    updateMut.mutate({ id, payload: { isActive: !isActive } });
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingCategory(null);
  };

  const renderContent = () => {
    if (isPending) return <CategoryGridSkeleton />;
    if (isError) return <ErrorMessage message="Failed to load categories." />;
    if (categories.length === 0) return <EmptyState label="No categories yet — create your first one." Icon={Tag} />;

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map(c => {
          const isUpdating = updateMut.isPending && updateMut.variables?.id === c.id;
          const isDeleting = deleteMut.isPending && deleteMut.variables === c.id;

          return (
            <div
              key={c.id}
              className={`group flex flex-col justify-between p-4 rounded-xl border border-border bg-surface hover:border-primary-300 transition-all ${
                isDeleting ? 'opacity-40 pointer-events-none' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center justify-center size-9 rounded-lg shrink-0 bg-gradient-to-br from-primary-500 to-primary-700 border border-primary-800/20 dark:from-primary-600 dark:to-primary-900 text-white">
                    <Tag size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-display font-medium text-text truncate" title={c.name}>
                      {c.name}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => toggleActive(c.id, c.isActive)}
                  disabled={isUpdating}
                  className={`text-xs font-display font-medium px-2 py-0.5 rounded-full shrink-0 cursor-pointer transition-colors disabled:opacity-50 flex items-center gap-1 ${
                    c.isActive
                      ? 'bg-success/10 text-success hover:bg-success/20'
                      : 'bg-surface-hover text-text-muted hover:bg-surface-active'
                  }`}
                >
                  {isUpdating && <Loader2 size={10} className="animate-spin" />}
                  {c.isActive ? 'Active' : 'Inactive'}
                </button>
              </div>

              <div className="flex flex-col gap-1.5 mb-3">
                <span className="flex items-center gap-1.5 text-xs font-display text-text-secondary">
                  <Building2 size={12} className="shrink-0 text-text-light" />
                  {c.departmentId?.name ?? '—'}
                </span>
                <span className="flex items-center gap-1.5 text-xs font-display text-text-secondary">
                  <Users size={12} className="shrink-0 text-text-light" />
                  {c.assigneeIds?.length ?? 0} default assignee{c.assigneeIds?.length === 1 ? '' : 's'}
                </span>
                <span className="text-xs font-display text-text-muted">
                  TAT: {c.tatHours ? `${c.tatHours}h` : 'System default'}
                </span>
              </div>

              <div className="flex items-center justify-end gap-1 pt-3 border-t border-border/60">
                <button
                  onClick={() => setEditingCategory(c)}
                  className="p-1.5 text-text-light hover:text-primary-500 hover:bg-primary-500/10 rounded-md transition-colors cursor-pointer"
                  aria-label="Edit category"
                >
                  <Pencil size={14} />
                </button>

                <button
                  onClick={() => deleteMut.mutate(c.id)}
                  disabled={isDeleting}
                  className="p-1.5 text-text-light hover:text-danger hover:bg-danger/10 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                  aria-label="Delete category"
                >
                  {isDeleting ? <Loader2 size={14} className="animate-spin text-danger" /> : <Trash2 size={14} />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const activeModal = showForm || editingCategory;

  return (
    // No max-w wrapper of its own — SettingsLayout (the parent route) already constrains width
    // to the shared --container-width token; adding a second, narrower max-w-7xl here just
    // double-nested the constraint for no reason.
    <div className="flex flex-col gap-6 w-full">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <GradientIconTile icon={Tag} />
          <div>
            <h1 className="text-xl font-display font-bold text-text">Categories</h1>
            <p className="text-sm text-text-muted mt-0.5">
              {categories.length} categor{categories.length !== 1 ? 'ies' : 'y'} — picking one on a ticket auto-fills department, assignees, and TAT
            </p>
          </div>
        </div>
        <Button size="sm" variant="primary" className="gap-1.5" onClick={() => setShowForm(true)}>
          <Plus size={14} />
          New category
        </Button>
      </div>

      {renderContent()}

      {activeModal && (
        <Suspense fallback={null}>
          <CategoryForm onClose={closeForm} category={editingCategory ?? undefined} />
        </Suspense>
      )}
    </div>
  );
};

const CategoryGridSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="flex flex-col justify-between p-4 rounded-xl border border-border bg-surface gap-4 h-44">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-lg shrink-0" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full shrink-0" />
        </div>
        <Skeleton className="h-3 w-24" />
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/50">
          <Skeleton className="size-7 rounded-md" />
          <Skeleton className="size-7 rounded-md" />
        </div>
      </div>
    ))}
  </div>
);
