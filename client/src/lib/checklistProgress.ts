type ChecklistLike = { items: { isDone: boolean }[] };

export const getChecklistProgress = (checklists: ChecklistLike[] | undefined | null) => {
  const list = checklists ?? [];
  const totalItems = list.reduce((sum, c) => sum + (c.items ?? []).length, 0);
  const doneItems = list.reduce((sum, c) => sum + (c.items ?? []).filter(i => i.isDone).length, 0);
  const progress = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : null;
  return { totalItems, doneItems, progress };
};
