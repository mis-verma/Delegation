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
/** Section label used across the delegation detail sheet and the New Delegation form (Title,
 *  Description, Details, Progress) — one quiet style for every heading in both. */
export const DETAIL_HEADING_CLASS =
  'flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium text-text-muted sm:text-text-secondary';

/** Date-range / department pickers rendered as chips in the Details row — same pill shape, border
 *  and text size as IconChip, so editable and read-only values look alike. */
export const CHIP_TRIGGER_CLASS =
  'w-auto h-8 pl-2.5 pr-3 gap-1.5 rounded-full border border-border/60 bg-surface hover:border-primary-400 text-xs font-semibold shadow-none focus:ring-2 focus:ring-primary-500/30';
