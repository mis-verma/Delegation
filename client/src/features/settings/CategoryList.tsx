import { useMemo, useState, lazy, Suspense } from "react";
import { CreateButton } from '../../components/createButton';
import { Tag, Users, Clock, Search, CircleOff, CirclePower, ListPlus, Plus } from "lucide-react";
import { PeriodTabControl } from "../dashboard/PeriodTabControl";
import { useAuth } from "@/context/AuthContext";
import {
  Button, Input, Skeleton, EmptyState, InlineError, useConfirm,
  ENTITY_CARD_CLASS, ColorIconTile, EntityCardActions,
} from "../../components";
import { useCategoriesQuery, useCategoryTatQuery, useDeleteCategoryMutation, useUpdateCategoryMutation } from "./hook";
import type { Category, CategoryTatRow } from "../../api/categories";
import { CardChip } from "../admin/directory/orgScores";
import { getInitials } from "../../lib/getInitials";
import { avatarColorClass } from "../../lib/avatarColors";
import { STARTER_CATEGORIES, normalizeCategoryName } from "./starterCategories";
import { SLA_BAR, SLA_TEXT, formatTatHours, slaTone } from "./tatFormat";

const CategoryForm = lazy(() =>
  import("./CategoryForm").then(module => ({ default: module.CategoryForm }))
);

const CategoryTatPanel = lazy(() =>
  import("./CategoryTatPanel").then(module => ({ default: module.CategoryTatPanel }))
);

const StarterCategoriesModal = lazy(() =>
  import("./StarterCategoriesModal").then(module => ({ default: module.StarterCategoriesModal }))
);

type CategoryTab = "list" | "tat";
const TAB_OPTIONS: readonly CategoryTab[] = ["list", "tat"];
const TAB_LABELS: Record<CategoryTab, string> = { list: "Categories", tat: "Time report" };

type StatusFilter = "all" | "active" | "inactive";
const STATUS_OPTIONS: readonly StatusFilter[] = ["all", "active", "inactive"];

const MAX_VISIBLE_AVATARS = 3;
const NO_DEPARTMENT = "No department";
const TILE_CLASS = "flex flex-col gap-1 rounded-2xl border border-border/60 bg-surface p-3 sm:p-4";

interface CategoryCardProps {
  category: Category;
  busy: boolean;
  usage?: CategoryTatRow;
  onEdit: (category: Category) => void;
  onToggle: (category: Category) => void;
  onRemove: (category: Category) => void;
}

const CategoryCard = ({ category: c, busy, usage, onEdit, onToggle, onRemove }: CategoryCardProps) => {
  const people = c.assigneeIds ?? [];
  const names = people.map((p) => `${p.firstName} ${p.lastName ?? ""}`.trim());
  const tone = slaTone(usage?.slaMetPct ?? null);

  return (
    <article className={`${ENTITY_CARD_CLASS} justify-start gap-3 ${!c.isActive ? "bg-surface-hover/30" : ""} ${busy ? "opacity-60 pointer-events-none" : ""}`}>
      <header className="flex items-start gap-3">
        <ColorIconTile icon={Tag} name={c.name} />
        <button
          type="button"
          onClick={() => onEdit(c)}
          className="min-w-0 flex-1 rounded-md text-left outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-primary-500/40"
          aria-label={`Edit ${c.name}`}
        >
          <h4 className={`t-card font-display font-bold leading-snug line-clamp-2 break-words ${c.isActive ? "text-text" : "text-text-secondary"}`} title={c.name}>
            {c.name}
          </h4>
        </button>
        <div className="-mr-2 -mt-1">
          <EntityCardActions
            onEdit={() => onEdit(c)}
            onDelete={() => onRemove(c)}
            isDeleting={false}
            editLabel={`Edit ${c.name}`}
            deleteLabel={`Delete ${c.name}`}
            extraItems={[{ label: c.isActive ? "Deactivate" : "Activate", icon: c.isActive ? CircleOff : CirclePower, onClick: () => onToggle(c) }]}
          />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        <CardChip icon={Clock} tone={c.tatHours ? "primary" : "neutral"} label={c.tatHours ? `Due in ${formatTatHours(c.tatHours)}` : "Default due time"} title="Due within" />
        {!c.isActive && <CardChip icon={CircleOff} label="Inactive" />}
      </div>

      <div className="flex items-center gap-2 min-w-0">
        {people.length > 0 ? (
          <>
            <span className="flex shrink-0 items-center -space-x-1.5">
              {names.slice(0, MAX_VISIBLE_AVATARS).map((name, i) => (
                <span key={people[i]!.id} title={name} className={`flex size-7 items-center justify-center rounded-full ring-2 ring-surface text-white t-meta font-bold ${avatarColorClass(name)}`}>
                  {getInitials(name)}
                </span>
              ))}
              {people.length > MAX_VISIBLE_AVATARS && (
                <span className="flex size-7 items-center justify-center rounded-full ring-2 ring-surface bg-surface-hover text-text-secondary t-meta font-bold" title={names.slice(MAX_VISIBLE_AVATARS).join(", ")}>
                  +{people.length - MAX_VISIBLE_AVATARS}
                </span>
              )}
            </span>
            <span className="truncate t-meta font-display font-semibold text-text-secondary">
              {names[0]}{people.length > 1 ? ` and ${people.length - 1} more` : ""}
            </span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5 t-meta font-display font-semibold text-text-muted">
            <Users className="size-3.5" aria-hidden />
            Department head picks the person
          </span>
        )}
      </div>

      {usage && usage.total > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-border/50 pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="t-meta font-display font-medium text-text-muted">Finished on time, last 90 days</span>
            <span className={`t-card font-display font-bold tabular-nums ${SLA_TEXT[tone]}`}>{usage.slaMetPct === null ? "–" : `${usage.slaMetPct}%`}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
            <div className={`h-full rounded-full transition-all duration-300 ease-out ${SLA_BAR[tone]}`} style={{ width: `${usage.slaMetPct ?? 0}%` }} />
          </div>
          <span className="t-meta tabular-nums text-text-muted">{usage.total} {usage.total === 1 ? "ticket" : "tickets"} filed</span>
        </div>
      )}
    </article>
  );
};

export const CategoryList = () => {
  const confirm = useConfirm();
  const { user } = useAuth();
  const canSeeReport = user?.role === "ADMIN" || user?.role === "PC";
  const [tab, setTab] = useState<CategoryTab>("list");
  const [showForm, setShowForm] = useState(false);
  const [showStarter, setShowStarter] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const { data: categories = [], isPending, isError, refetch } = useCategoriesQuery();
  const { data: usageReport } = useCategoryTatQuery(90, canSeeReport);
  const updateMut = useUpdateCategoryMutation();
  const deleteMut = useDeleteCategoryMutation();

  const usageById = useMemo(() => new Map((usageReport?.rows ?? []).flatMap((row) => (row.categoryId ? [[row.categoryId, row] as const] : []))), [usageReport]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return categories.filter((c) => {
      if (status === "active" && !c.isActive) return false;
      if (status === "inactive" && c.isActive) return false;
      return !needle || c.name.toLowerCase().includes(needle) || (c.departmentId?.name ?? "").toLowerCase().includes(needle);
    });
  }, [categories, query, status]);

  const groups = useMemo(() => {
    const byDepartment = new Map<string, { name: string; items: Category[] }>();
    for (const c of shown) {
      const name = c.departmentId?.name || NO_DEPARTMENT;
      const group = byDepartment.get(name) ?? { name, items: [] };
      group.items.push(c);
      byDepartment.set(name, group);
    }
    return [...byDepartment.values()].sort((a, b) => (a.name === NO_DEPARTMENT ? 1 : b.name === NO_DEPARTMENT ? -1 : a.name.localeCompare(b.name)));
  }, [shown]);

  const activeCount = useMemo(() => categories.filter((c) => c.isActive).length, [categories]);
  const headPicksCount = useMemo(() => categories.filter((c) => c.isActive && (c.assigneeIds?.length ?? 0) === 0).length, [categories]);
  const defaultDueCount = useMemo(() => categories.filter((c) => c.isActive && !c.tatHours).length, [categories]);
  const missingStarter = useMemo(() => {
    const have = new Set(categories.map((c) => normalizeCategoryName(c.name)));
    return STARTER_CATEGORIES.filter((s) => !have.has(normalizeCategoryName(s.name))).length;
  }, [categories]);

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
          action={{ label: "Add the usual categories", icon: ListPlus, onClick: () => setShowStarter(true) }}
        />
      );
    }
    if (shown.length === 0) {
      return <EmptyState icon={Search} title="No categories match" description="Try another name or department." action={{ label: "Clear search and filter", onClick: () => { setQuery(""); setStatus("all"); } }} />;
    }

    return (
      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <section key={group.name} aria-label={group.name} className="flex flex-col gap-3">
            <h3 className="flex items-center gap-2 t-card font-display font-bold text-text">
              {group.name}
              <span className="t-meta font-semibold tabular-nums text-text-muted">{group.items.length}</span>
            </h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.items.map((c) => (
                <CategoryCard
                  key={c.id}
                  category={c}
                  usage={usageById.get(c.id)}
                  busy={(updateMut.isPending && updateMut.variables?.id === c.id) || (deleteMut.isPending && deleteMut.variables === c.id)}
                  onEdit={setEditingCategory}
                  onToggle={toggleActive}
                  onRemove={(category) => { void remove(category); }}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  };

  const activeModal = showForm || editingCategory;

  return (
    <div className="flex flex-col gap-3 sm:gap-4 w-full">
      <div className="flex flex-col gap-0.5">
        <h2 className="t-section font-display font-bold text-text">Ticket categories</h2>
        <p className="hidden t-meta font-display text-text-muted sm:block">
          Picking one on a ticket fills in the team, the people and the due time.
        </p>
      </div>

      {canSeeReport && (
        <PeriodTabControl value={tab} options={TAB_OPTIONS} labels={TAB_LABELS} onChange={setTab} />
      )}

      {tab === "tat" && canSeeReport ? (
        <Suspense fallback={<Skeleton className="h-40 rounded-2xl" />}>
          <CategoryTatPanel />
        </Suspense>
      ) : (
        <>
          {!isPending && categories.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className={TILE_CLASS}>
                <span className="t-meta font-display font-medium text-text-muted">Categories</span>
                <span className="t-stat font-display font-bold tabular-nums text-text">{categories.length}</span>
              </div>
              <div className={TILE_CLASS}>
                <span className="t-meta font-display font-medium text-text-muted">Active</span>
                <span className="t-stat font-display font-bold tabular-nums text-vivid-green-text">{activeCount}</span>
              </div>
              <div className={TILE_CLASS}>
                <span className="t-meta font-display font-medium text-text-muted">Head picks the person</span>
                <span className="t-stat font-display font-bold tabular-nums text-text">{headPicksCount}</span>
              </div>
              <div className={TILE_CLASS}>
                <span className="t-meta font-display font-medium text-text-muted">Default due time</span>
                <span className="t-stat font-display font-bold tabular-nums text-text">{defaultDueCount}</span>
              </div>
            </div>
          )}

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
            <div className="flex items-center gap-2 sm:ml-auto">
              {missingStarter > 0 && categories.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setShowStarter(true)} className="h-9 max-sm:h-11 font-display font-semibold">
                  <Plus size={15} aria-hidden />
                  Add usual ({missingStarter})
                </Button>
              )}
              <CreateButton label="New category" onClick={() => setShowForm(true)} />
            </div>
          </div>

          {renderContent()}
        </>
      )}

      {activeModal && (
        <Suspense fallback={null}>
          <CategoryForm onClose={closeForm} category={editingCategory ?? undefined} />
        </Suspense>
      )}
      {showStarter && (
        <Suspense fallback={null}>
          <StarterCategoriesModal onClose={() => setShowStarter(false)} />
        </Suspense>
      )}
    </div>
  );
};

const CategoryGridSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" aria-hidden>
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className={`${ENTITY_CARD_CLASS} justify-start gap-3`}>
        <div className="flex items-start gap-3">
          <Skeleton className="size-10 rounded-xl shrink-0" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        <Skeleton className="h-6 w-28 rounded-full" />
        <Skeleton className="h-7 w-40" />
      </div>
    ))}
  </div>
);
