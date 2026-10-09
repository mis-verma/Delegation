import { useMemo, useState, lazy, Suspense } from "react";
import { Plus, Tag, Building2, Users, Clock, Search } from "lucide-react";
import {
  Button, Input, Skeleton, EmptyState, InlineError, useConfirm,
  ENTITY_CARD_CLASS, ColorIconTile, StatusPill, EntityCardActions,
} from "../../components";
import { useCategoriesQuery, useDeleteCategoryMutation, useUpdateCategoryMutation } from "./hook";
import type { Category } from "../../api/categories";

const CategoryForm = lazy(() =>
  import("./CategoryForm").then(module => ({ default: module.CategoryForm }))
);

export const CategoryList = () => {
  const confirm = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [query, setQuery] = useState("");

  const { data: categories = [], isPending, isError, refetch } = useCategoriesQuery();
  const updateMut = useUpdateCategoryMutation();
  const deleteMut = useDeleteCategoryMutation();

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(needle) || (c.departmentId?.name ?? "").toLowerCase().includes(needle));
  }, [categories, query]);

  const toggleActive = (c: Category) => updateMut.mutate({ id: c.id, payload: { isActive: !c.isActive } });

  const remove = async (c: Category) => {
    const ok = await confirm({
      title: `Delete "${c.name}"?`,
      description: "Tickets already filed under it keep their details. It can no longer be picked on new tickets.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (ok) deleteMut.mutate(c.id);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingCategory(null);
  };

  const renderContent = () => {
    if (isPending) return <CategoryGridSkeleton />;
    if (isError) return <InlineError message="We couldn't load the categories. Check your connection and try again." onRetry={() => { void refetch(); }} />;
    if (categories.length === 0) {
      return (
        <EmptyState
          icon={Tag}
          title="No categories yet"
          description="A category fills in the department, default people and due time when someone picks it on a ticket."
          action={{ label: "New category", icon: Plus, onClick: () => setShowForm(true) }}
        />
      );
    }
    if (shown.length === 0) {
      return <EmptyState icon={Search} title="No categories match" description="Try another name or department." action={{ label: "Clear search", onClick: () => setQuery("") }} />;
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {shown.map((c) => {
          const isUpdating = updateMut.isPending && updateMut.variables?.id === c.id;
          const isDeleting = deleteMut.isPending && deleteMut.variables === c.id;
          const people = c.assigneeIds?.length ?? 0;

          return (
            <article
              key={c.id}
              className={`${ENTITY_CARD_CLASS} justify-start gap-3.5 ${isDeleting ? "opacity-50 pointer-events-none" : ""}`}
            >
              <header className="flex items-start justify-between gap-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <ColorIconTile icon={Tag} name={c.name} />
                  <div className="min-w-0 flex flex-col gap-0.5">
                    <h3
                      className={`text-sm font-display font-bold truncate ${c.isActive ? "text-text" : "text-text-secondary"}`}
                      title={c.name}
                    >
                      {c.name}
                    </h3>
                    <p className="flex items-center gap-1 text-xs font-display text-text-muted min-w-0" title={c.departmentId?.name}>
                      <Building2 className="size-3 shrink-0 text-text-light" aria-hidden />
                      <span className="truncate">{c.departmentId?.name ?? "No department"}</span>
                    </p>
                  </div>
                </div>

                <StatusPill
                  active={c.isActive}
                  isUpdating={isUpdating}
                  onToggle={() => toggleActive(c)}
                  ariaLabel={`${c.isActive ? "Deactivate" : "Activate"} ${c.name}`}
                />
              </header>

              <footer className="flex items-center justify-between gap-2 pt-3 mt-auto border-t border-border/60 min-h-14">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 min-w-0">
                  <span className="flex items-center gap-1.5 text-xs font-display text-text-secondary" title="Default assignees">
                    <Users size={14} className="shrink-0 text-text-light" aria-hidden />
                    <span className="font-bold tabular-nums text-text">{people}</span>
                    {people === 1 ? "person" : "people"}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-display text-text-secondary" title="Due within">
                    <Clock size={14} className="shrink-0 text-text-light" aria-hidden />
                    {c.tatHours ? <><span className="font-bold tabular-nums text-text">{c.tatHours}</span>h</> : "System default"}
                  </span>
                </div>

                <EntityCardActions
                  onEdit={() => setEditingCategory(c)}
                  onDelete={() => { void remove(c); }}
                  isDeleting={isDeleting}
                  editLabel={`Edit ${c.name} category`}
                  deleteLabel={`Delete ${c.name} category`}
                />
              </footer>
            </article>
          );
        })}
      </div>
    );
  };

  const activeModal = showForm || editingCategory;

  return (
    // No max-w wrapper of its own: SettingsLayout (the parent route) already constrains the width.
    <div className="flex flex-col gap-5 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="min-w-0 sm:flex-1">
          <h2 className="t-section font-display font-bold text-text tracking-tight">Categories</h2>
          <p className="text-sm font-display text-text-muted">
            {isPending ? "Loading" : `${categories.length} ${categories.length === 1 ? "category" : "categories"}`}. Picking one on a ticket fills in its department, default people and due time.
          </p>
        </div>
        {categories.length > 0 && (
          <div className="sm:w-64">
            <Input
              id="category-search"
              type="search"
              icon={Search}
              aria-label="Search categories"
              placeholder="Search categories..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}
        <Button size="sm" variant="primary" className="gap-1.5 shrink-0" onClick={() => setShowForm(true)}>
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
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" aria-hidden>
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className={`${ENTITY_CARD_CLASS} justify-start gap-3.5`}>
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Skeleton className="size-10 rounded-xl shrink-0" />
            <div className="flex flex-col gap-1.5 flex-1 max-w-[70%]">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
          <Skeleton className="h-6 w-20 rounded-full shrink-0" />
        </div>
        <div className="flex items-center justify-between pt-3 mt-auto border-t border-border/60 min-h-14">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="size-9 rounded-lg" />
        </div>
      </div>
    ))}
  </div>
);
