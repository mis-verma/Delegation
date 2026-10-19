import { useMemo, useState, lazy, Suspense } from "react";
import { Plus, Tag, Building2, Users, Clock, Search, CircleOff, CirclePower } from "lucide-react";
import { PeriodTabControl } from "../dashboard/PeriodTabControl";
import {
  Button, Input, Skeleton, EmptyState, InlineError, useConfirm,
  ENTITY_CARD_CLASS, ColorIconTile, EntityCardActions,
} from "../../components";
import { useCategoriesQuery, useDeleteCategoryMutation, useUpdateCategoryMutation } from "./hook";
import type { Category } from "../../api/categories";
import { CardChip } from "../admin/directory/orgScores";

const CategoryForm = lazy(() =>
  import("./CategoryForm").then(module => ({ default: module.CategoryForm }))
);

type StatusFilter = "all" | "active" | "inactive";
const STATUS_OPTIONS: readonly StatusFilter[] = ["all", "active", "inactive"];

export const CategoryList = () => {
  const confirm = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const { data: categories = [], isPending, isError, refetch } = useCategoriesQuery();
  const updateMut = useUpdateCategoryMutation();
  const deleteMut = useDeleteCategoryMutation();

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return categories.filter((c) => {
      if (status === "active" && !c.isActive) return false;
      if (status === "inactive" && c.isActive) return false;
      return !needle || c.name.toLowerCase().includes(needle) || (c.departmentId?.name ?? "").toLowerCase().includes(needle);
    });
  }, [categories, query, status]);

  const activeCount = useMemo(() => categories.filter((c) => c.isActive).length, [categories]);

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
      return <EmptyState icon={Search} title="No categories match" description="Try another name or department." action={{ label: "Clear search and filter", onClick: () => { setQuery(""); setStatus("all"); } }} />;
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
              className={`${ENTITY_CARD_CLASS} justify-start gap-3 ${!c.isActive ? "bg-surface-hover/30" : ""} ${isDeleting || isUpdating ? "opacity-60 pointer-events-none" : ""}`}
            >
              <header className="flex items-start gap-3">
                <ColorIconTile icon={Tag} name={c.name} />
                <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                  <h3 className={`t-card font-display font-bold leading-snug line-clamp-2 break-words ${c.isActive ? "text-text" : "text-text-secondary"}`} title={c.name}>
                    {c.name}
                  </h3>
                  <p className="flex items-center gap-1 t-meta font-display text-text-muted min-w-0" title={c.departmentId?.name}>
                    <Building2 className="size-3 shrink-0" aria-hidden />
                    <span className="truncate">{c.departmentId?.name ?? "No department"}</span>
                  </p>
                </div>
                <div className="-mr-2 -mt-1">
                  <EntityCardActions
                    onEdit={() => setEditingCategory(c)}
                    onDelete={() => { void remove(c); }}
                    isDeleting={isDeleting}
                    editLabel={`Edit ${c.name}`}
                    deleteLabel={`Delete ${c.name}`}
                    extraItems={[{ label: c.isActive ? "Deactivate" : "Activate", icon: c.isActive ? CircleOff : CirclePower, onClick: () => toggleActive(c) }]}
                  />
                </div>
              </header>

              <div className="flex flex-wrap items-center gap-1.5">
                <CardChip icon={Users} tone={people ? "primary" : "warning"} label={people ? `${people} ${people === 1 ? "person" : "people"}` : "Head picks"} title="Who gets it" />
                <CardChip icon={Clock} label={c.tatHours ? `Due in ${c.tatHours % 24 === 0 ? `${c.tatHours / 24}d` : `${c.tatHours}h`}` : "Default due time"} title="Due within" />
                {!c.isActive && <CardChip icon={CircleOff} label="Inactive" />}
              </div>
            </article>
          );
        })}
      </div>
    );
  };

  const activeModal = showForm || editingCategory;

  return (
    <div className="flex flex-col gap-3 sm:gap-4 w-full">
      <div className="flex flex-col gap-0.5">
        <h2 className="t-section font-display font-bold text-text">Ticket categories</h2>
        <p className="t-meta font-display text-text-muted">
          Picking one on a ticket fills in the team, the people and the due time.
          {!isPending && categories.length > 0 && ` ${activeCount} of ${categories.length} ${categories.length === 1 ? "is" : "are"} active.`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {categories.length > 0 && (
          <div className="flex-1 min-w-48 sm:max-w-xs">
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
        {categories.length > 0 && (
          <PeriodTabControl
            value={status}
            options={STATUS_OPTIONS}
            labels={{ all: `All ${categories.length}`, active: `Active ${activeCount}`, inactive: `Inactive ${categories.length - activeCount}` }}
            onChange={setStatus}
          />
        )}
        <Button size="sm" variant="primary" aria-label="New category" className="gap-1.5 shrink-0 max-sm:size-11 max-sm:px-0 sm:ml-auto" onClick={() => setShowForm(true)}>
          <Plus size={15} aria-hidden />
          <span className="max-sm:sr-only">New category</span>
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
