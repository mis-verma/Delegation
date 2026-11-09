import type { ChecklistInstanceItem } from '../../../../api/checklistInstances';

export interface FillProgress {
  done: number;
  total: number;
  left: number;
  overdue: boolean;
  people: { done: number; total: number } | null;
}

export const auditPeopleProgress = (items: ChecklistInstanceItem[]): FillProgress['people'] => {
  const audits = items.filter((i) => i.itemType === 'AUDIT' && !i.isNotApplicable);
  if (!audits.length) return null;
  let done = 0;
  let total = 0;
  for (const item of audits) {
    for (const s of item.submissions) {
      total += 1;
      if (s.isDone || s.isNotApplicable) done += 1;
    }
  }
  return total > 0 ? { done, total } : null;
};

export interface SectionInfo {
  key: string;
  label: string;
  done: number;
  total: number;
}

export const sectionKeyOf = (item: Pick<ChecklistInstanceItem, 'section'>) => item.section ?? '';

export const sectionsOf = (items: ChecklistInstanceItem[], answered: (i: ChecklistInstanceItem) => boolean): SectionInfo[] => {
  const byKey = new Map<string, SectionInfo>();
  for (const item of items) {
    const key = sectionKeyOf(item);
    const info = byKey.get(key) ?? { key, label: item.section ?? 'Other questions', done: 0, total: 0 };
    info.total += 1;
    if (answered(item)) info.done += 1;
    byKey.set(key, info);
  }
  return [...byKey.values()];
};
