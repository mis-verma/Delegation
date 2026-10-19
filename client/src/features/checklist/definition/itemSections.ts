import type { ItemDraft } from './ChecklistDefinitionItemDraftRow';

export const UNGROUPED = '__ungrouped__';
export type SectionId = string;

const sectionIdOf = (section: string | null): SectionId => section ?? UNGROUPED;

export const groupBySection = (itemDrafts: ItemDraft[], sections: string[]): Record<SectionId, ItemDraft[]> => {
  const groups: Record<SectionId, ItemDraft[]> = { [UNGROUPED]: [] };
  for (const name of sections) groups[name] = [];
  for (const draft of itemDrafts) {
    const id = sectionIdOf(draft.section);
    if (!groups[id]) groups[id] = [];
    groups[id].push(draft);
  }
  return groups;
};

export const containerOrderFor = (sections: string[]): SectionId[] => [UNGROUPED, ...sections];

export const MAX_CHECKLIST_ITEMS = 200;
export const MAX_SECTION_NAME_LENGTH = 120;

export const cloneItemDraft = (draft: ItemDraft, patch: Partial<ItemDraft> = {}): ItemDraft => ({
  ...draft,
  auditUserIds: [...draft.auditUserIds],
  accessories: [...draft.accessories],
  accessoriesFemale: [...draft.accessoriesFemale],
  accessoriesMale: [...draft.accessoriesMale],
  accessoriesByType: Object.fromEntries(Object.entries(draft.accessoriesByType).map(([id, list]) => [id, [...list]])),
  options: [...draft.options],
  acceptableAnswers: [...draft.acceptableAnswers],
  yesActions: [...draft.yesActions],
  noActions: [...draft.noActions],
  ...patch,
  key: crypto.randomUUID(),
});

export const copiedSectionName = (name: string, taken: readonly string[]): string => {
  const withSuffix = (suffix: string) => `${name.slice(0, MAX_SECTION_NAME_LENGTH - suffix.length).trimEnd()}${suffix}`;
  let candidate = withSuffix(' (copy)');
  for (let n = 2; taken.includes(candidate); n++) candidate = withSuffix(` (copy ${n})`);
  return candidate;
};

const flattenGroups = (order: SectionId[], groups: Record<SectionId, ItemDraft[]>): ItemDraft[] =>
  order.flatMap((id) => groups[id] ?? []);

export const normalizeItemOrder = (itemDrafts: ItemDraft[], sections: string[]): ItemDraft[] => {
  const groups = groupBySection(itemDrafts, sections);
  const order = containerOrderFor(sections);
  const strays = Object.keys(groups).filter((id) => !order.includes(id));
  return flattenGroups([...order, ...strays], groups);
};
