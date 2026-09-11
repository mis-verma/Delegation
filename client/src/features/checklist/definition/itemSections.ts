import type { ItemDraft } from './ChecklistDefinitionItemDraftRow';

// Sentinel id for the "no section" bucket — never a value a user can type as a real section name
// (the section-name input is free text, but this string is reserved for internal grouping only).
export const UNGROUPED = '__ungrouped__';
export type SectionId = string;

export const sectionIdOf = (section: string | null): SectionId => section ?? UNGROUPED;

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

export const flattenGroups = (order: SectionId[], groups: Record<SectionId, ItemDraft[]>): ItemDraft[] =>
  order.flatMap((id) => groups[id] ?? []);

// Re-groups then flattens straight back — guarantees items sharing a section are contiguous in
// the result, in [Ungrouped, ...sections] order. The saved item order IS this flattened array (no
// separate per-item "order" the client sends), and ChecklistInstanceDetail's section-header
// rendering assumes same-section items are contiguous — so this must run any time an item is
// added or an existing (possibly stale/out-of-order) checklist is loaded into the builder, not
// only after a drag.
export const normalizeItemOrder = (itemDrafts: ItemDraft[], sections: string[]): ItemDraft[] =>
  flattenGroups(containerOrderFor(sections), groupBySection(itemDrafts, sections));
