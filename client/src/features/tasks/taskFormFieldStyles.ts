// No `mb-*` here on purpose. It used to carry `mb-1.5`, which stacked on top of the `gap` that
// every field wrapper (and the Input component itself) already sets — so the space under a label
// was 1.5 + the wrapper's own gap, and since wrappers disagreed (gap-1.5 vs gap-2) no two fields
// were spaced the same. Spacing belongs to the wrapper's `gap`, per client/CLAUDE.md.
export const FIELD_LABEL_CLASS =
  'text-sm font-medium text-text-secondary normal-case tracking-normal leading-none flex items-center gap-1.5 select-none transition-colors duration-200 ease-in-out';

export const FIELD_LABEL_ICON_CLASS =
  'w-3.5 h-3.5 shrink-0 text-text-light group-focus-within/field:text-primary-500 transition-colors duration-200 ease-in-out';

export const FIELD_CARD_CLASS = '';

/** Capitalized (not uppercase) group heading (e.g. "Title", "Properties") — a level above
 *  FIELD_LABEL_CLASS, used to introduce a whole section rather than label one field. */
export const SECTION_LABEL_CLASS = 'text-xs font-bold text-text-light';