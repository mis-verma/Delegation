// One colour per kind of change, as a gradient circle with a white icon, the same language as the priority chips,
// the dashboard cards and the notification list. Shared by the plain Activity feed and the full change log.
export const TONE = {
  primary: 'bg-linear-to-br from-primary-500 to-primary-600',
  success: 'bg-linear-to-br from-success to-success/70',
  info: 'bg-linear-to-br from-info to-info/70',
  warning: 'bg-linear-to-br from-warning to-warning/70',
  danger: 'bg-linear-to-br from-danger to-danger/70',
  coral: 'bg-linear-to-br from-coral-500 to-coral-600',
  muted: 'bg-linear-to-br from-text-muted to-text-light',
} as const;

export type ActivityTone = keyof typeof TONE;

/** The rail node: an opaque gradient disc so the line behind it never shows through. */
export const NODE_CLASS = 'absolute -left-11 top-2 z-10 flex size-8 items-center justify-center rounded-full text-white ring-4 ring-surface';

/** One entry: a soft card, so the history reads as separate events and not as bare text on the page. */
export const ENTRY_CLASS = 'flex flex-col gap-2 rounded-xl border border-border/60 bg-surface-hover/30 px-3.5 py-2.5 transition-colors duration-200 hover:border-border-hover';

/** The section heading's icon tile. */
export const HEADING_TILE_CLASS = 'flex size-8 items-center justify-center rounded-lg text-white ' + TONE.primary;
