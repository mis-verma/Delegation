// No `mb-*` here on purpose. It used to carry `mb-1.5`, which stacked on top of the `gap` that
// every field wrapper (and the Input component itself) already sets — so the space under a label
// was 1.5 + the wrapper's own gap, and since wrappers disagreed (gap-1.5 vs gap-2) no two fields
// were spaced the same. Spacing belongs to the wrapper's `gap`, per client/CLAUDE.md.
// text-xs on phones — labels are the one piece of form text that can shrink there. Inputs stay at
// 16px: iOS zooms the whole page in on focus for anything smaller.
export const FIELD_LABEL_CLASS =
  'text-xs sm:text-sm font-medium text-text-secondary normal-case tracking-normal leading-none flex items-center gap-1.5 select-none transition-colors duration-200 ease-in-out';

export const FIELD_LABEL_ICON_CLASS =
  'w-3.5 h-3.5 shrink-0 text-text-light group-focus-within/field:text-primary-500 transition-colors duration-200 ease-in-out';

export const FIELD_CARD_CLASS = '';

/** Capitalized (not uppercase) group heading (e.g. "Title", "Properties") — a level above
 *  FIELD_LABEL_CLASS, used to introduce a whole section rather than label one field. `flex items-
 *  center gap-1.5` (added alongside its first icon) lines up an icon the same way every per-field
 *  label here already does via FIELD_LABEL_CLASS — plain text with no `gap` cost these headings
 *  nothing when they had no icon, so this is a no-op for spacing until one is added. */
export const SECTION_LABEL_CLASS = 'text-xs font-bold text-text-light flex items-center gap-1.5';

/** TaskForm's own top-level section dividers ("The work", "Assignment"). Quiet, Notion-style group
 *  label — no bold weight, no icon tint, no rule underneath; same reference as the Create Ticket
 *  modal's identical heading, which a bold+bordered treatment read as too heavy for a label above a
 *  cluster of fields inside one modal. Kept separate from SECTION_LABEL_CLASS above (still used by
 *  TaskDetail.tsx as-is) rather than changing it in place. */
export const SECTION_TITLE_CLASS = 'flex items-center gap-2 text-xs font-display font-semibold text-text-light';