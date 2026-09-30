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

// Limits the server enforces on save (checklistDefinition.validation.ts) — checked while
// duplicating so a copy can't push the checklist over and only fail at the final Save.
export const MAX_CHECKLIST_ITEMS = 200;
const MAX_SECTION_NAME_LENGTH = 120;

// A copy of one question with an identity of its own. Every field but `key` is a string, a boolean
// or an array of strings, so copying the arrays one level down is a full deep copy — editing the
// copy's options/auditors/actions can't reach back into the original.
export const cloneItemDraft = (draft: ItemDraft, patch: Partial<ItemDraft> = {}): ItemDraft => ({
  ...draft,
  auditUserIds: [...draft.auditUserIds],
  accessories: [...draft.accessories],
  options: [...draft.options],
  yesActions: [...draft.yesActions],
  noActions: [...draft.noActions],
  ...patch,
  key: crypto.randomUUID(),
});

// "Opening" becomes "Opening (copy)", then "Opening (copy 2)", and so on: the first name that isn't
// taken yet, trimmed so even a very long section name stays inside the server's length limit.
export const copiedSectionName = (name: string, taken: readonly string[]): string => {
  const withSuffix = (suffix: string) => `${name.slice(0, MAX_SECTION_NAME_LENGTH - suffix.length).trimEnd()}${suffix}`;
  let candidate = withSuffix(' (copy)');
  for (let n = 2; taken.includes(candidate); n++) candidate = withSuffix(` (copy ${n})`);
  return candidate;
};

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
