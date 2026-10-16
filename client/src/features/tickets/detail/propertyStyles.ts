// One look for every property value in the Ticket and Delegation sheets, so Priority, Department, Due and the people
// read the same in both. Read-only values are plain small bold text (or their chip, for priority); anything you can
// change is the same bordered box: full width of its tile, 36px, a small chevron or clear on the right.

/** A value the viewer can't change: plain small bold text. */
export const PROPERTY_VALUE_CLASS = 't-meta font-display font-semibold text-text break-words';

/** The trigger of a property you can change (priority, department, due date). Merged onto the shared dropdowns. */
export const PROPERTY_TRIGGER_CLASS =
  'h-9 w-full min-w-0 max-w-full gap-1.5 rounded-lg border border-border/60 bg-surface pl-2 pr-1.5 t-meta font-display font-semibold text-text shadow-none hover:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-500/30';

/** The Due tile's colour: red once it's late, orange otherwise (both sheets). */
export const dueTone = (late: boolean) => (late ? 'bg-linear-to-br from-danger to-danger/70' : 'bg-linear-to-br from-warning to-warning/70');
