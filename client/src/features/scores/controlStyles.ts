// Shared looks for the score screens, so a filter, a card and a header are the same shape on every page.

/** A native select: 44px on a phone, 36px from sm up, 16px type on a phone (iOS zooms the page below that). */
export const SELECT_CLASS =
  'min-h-11 w-full min-w-0 cursor-pointer rounded-lg border border-border bg-surface px-3 text-base font-display text-text outline-none transition-colors hover:border-border-hover focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/30 sm:min-h-9 sm:text-sm';

/** The small label above a control or a group of controls. */
export const FIELD_LABEL_CLASS = 'px-0.5 t-meta font-display font-semibold text-text-muted';

/** Padding of every score card (used with PANEL_CLASS). */
export const CARD_PAD = 'p-4';

/** A small outlined link or button inside a popup, one per list that a figure opens. No press-scale: the border changes, nothing moves. */
export const DRILL_LINK_CLASS =
  'inline-flex min-h-9 pointer-coarse:min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 t-meta font-display font-semibold text-text-secondary transition-[border-color,color] duration-150 ease-out hover:border-border-hover hover:text-text outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40';

/** The scrolling frame of a score table: the header stays in view while the rows scroll. */
export const TABLE_FRAME_CLASS = 'hidden max-h-[70vh] overflow-auto rounded-lg border border-border md:block';

/** A search box: same height, radius and type as SELECT_CLASS; the magnifier sits at left-3, hence the pl-8. */
export const SEARCH_INPUT_CLASS =
  'min-h-11 w-full rounded-lg border border-border bg-surface pl-8 pr-3 text-base text-text outline-none transition-colors placeholder:text-text-light focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/30 sm:min-h-9 sm:text-sm';
