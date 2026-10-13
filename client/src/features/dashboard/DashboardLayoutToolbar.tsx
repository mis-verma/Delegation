import { Eye, LayoutGrid, RotateCcw, Check } from 'lucide-react';

interface DashboardLayoutToolbarProps {
  isCustomizing: boolean;
  onStart: () => void;
  onReset: () => void;
  onDone: () => void;
  /** Cards hidden right now, for the "bring back" row. */
  hiddenCards: { id: string; label: string }[];
  onShow: (id: string) => void;
  /** Phone: the instructions say "move up or down" instead of "drag". */
  touch?: boolean;
}

// One entry point for the whole feature: a quiet ghost button at rest, becoming the active-mode
// toolbar (what's happening + the two ways out — start fresh, or keep it) once customizing starts.
// Same bar, same position, so nothing jumps around the moment the mode flips.
export const DashboardLayoutToolbar = ({ isCustomizing, onStart, onReset, onDone, hiddenCards, onShow, touch = false }: DashboardLayoutToolbarProps) => {
  if (!isCustomizing) {
    // Desktop: just the icon, a quiet square that takes far less room above the stats than a labelled button.
    // Phone: a 44px "Customize" button, because an icon alone is easy to miss and to miss-tap.
    return (
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={onStart}
          aria-label={hiddenCards.length > 0 ? `Customize dashboard, ${hiddenCards.length} hidden` : 'Customize dashboard'}
          title="Customize dashboard"
          className="relative inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 t-meta font-display font-semibold text-text-secondary transition-colors cursor-pointer hover:bg-surface-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 sm:size-8 sm:px-0"
        >
          <LayoutGrid size={14} strokeWidth={2.25} aria-hidden="true" />
          <span className="sm:hidden">Customize</span>
          {hiddenCards.length > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-600 px-1 text-xs font-display font-bold leading-none text-white" aria-hidden="true">
              {hiddenCards.length}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3 rounded-xl border border-primary-500/60 bg-primary-500/5">
    <div role="status" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs font-display font-semibold text-primary-700 dark:text-primary-300">
        <LayoutGrid size={14} strokeWidth={2.25} className="text-primary-600 dark:text-primary-300 shrink-0" />
        {touch ? 'Move cards up or down, or switch them off' : 'Drag a card by its grip to reorder, set its size, or hide it'}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 h-11 sm:h-8 px-3rounded-lg border border-border bg-surface text-xs font-display font-semibold text-text-secondary hover:bg-surface-hover hover:text-text transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          <RotateCcw size={13} strokeWidth={2.25} />
          Reset to default
        </button>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex items-center gap-1.5 h-11 sm:h-8 px-3.5 rounded-lg bg-primary-600 text-xs font-display font-semibold text-white hover:bg-primary-700 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          <Check size={13} strokeWidth={2.5} />
          Done
        </button>
      </div>
    </div>
    {hiddenCards.length > 0 && (
      <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-primary-500/20">
        <span className="text-xs font-display font-semibold text-text-secondary">Hidden</span>
        {hiddenCards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => onShow(card.id)}
            title={`Show ${card.label}`}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-border bg-surface text-xs font-display font-semibold text-text-secondary hover:bg-surface-hover hover:text-text transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <Eye size={13} strokeWidth={2.25} />
            {card.label}
          </button>
        ))}
      </div>
    )}
    </div>
  );
};
