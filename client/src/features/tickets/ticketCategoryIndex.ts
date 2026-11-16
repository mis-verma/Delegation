import type { Category, Subcategory } from '../../api/categories';

export interface ProblemEntry {
  category: Category;
  subcategory: Subcategory;
}

export interface CategoryIndex {
  byId: ReadonlyMap<string, Category>;
  problemById: ReadonlyMap<string, ProblemEntry>;
  problems: readonly ProblemEntry[];
}

const EMPTY_INDEX: CategoryIndex = { byId: new Map(), problemById: new Map(), problems: [] };

export const departmentIdOf = (category: Pick<Category, 'departmentId'>): string =>
  typeof category.departmentId === 'object' ? category.departmentId.id : String(category.departmentId);

export const buildCategoryIndex = (categories: readonly Category[] | undefined): CategoryIndex => {
  if (!categories?.length) return EMPTY_INDEX;
  const byId = new Map<string, Category>();
  const problemById = new Map<string, ProblemEntry>();
  const problems: ProblemEntry[] = [];
  for (const category of categories) {
    byId.set(category.id, category);
    if (!category.isActive) continue;
    for (const subcategory of category.subcategories) {
      if (!subcategory.isActive) continue;
      const entry = { category, subcategory };
      problemById.set(subcategory.id, entry);
      problems.push(entry);
    }
  }
  problems.sort((a, b) => a.category.name.localeCompare(b.category.name) || a.subcategory.name.localeCompare(b.subcategory.name));
  return { byId, problemById, problems };
};

export const hasActiveSubcategory = (category: Category | undefined): boolean => !!category?.subcategories.some((s) => s.isActive);
