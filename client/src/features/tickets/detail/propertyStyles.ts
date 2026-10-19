
export const PROPERTY_VALUE_CLASS = 't-meta font-display font-semibold text-text break-words';

export const PROPERTY_TRIGGER_CLASS =
  'h-9 w-full min-w-0 max-w-full gap-1.5 rounded-lg border border-border/60 bg-surface pl-2 pr-1.5 t-meta font-display font-semibold text-text shadow-none hover:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-500/30';

export const dueTone = (late: boolean) => (late ? 'bg-linear-to-br from-danger to-danger/70' : 'bg-linear-to-br from-warning to-warning/70');
