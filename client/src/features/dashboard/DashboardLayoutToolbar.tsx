import { Eye, LayoutGrid, RotateCcw, Check } from 'lucide-react';
import { toast } from 'sonner';

interface DashboardLayoutToolbarProps {
  isCustomizing: boolean;
  onStart: () => void;
  onReset: () => void;
  onDone: () => void;
  hiddenCards: { id: string; label: string }[];
  onShow: (id: string) => void;
  touch?: boolean;
}

export const DashboardLayoutToolbar = ({ isCustomizing, onStart, onReset, onDone, hiddenCards, onShow, touch = false }: DashboardLayoutToolbarProps) => {
  if (!isCustomizing) {
    return (
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={onStart}
          aria-label={hiddenCards.length > 0 ? `Customize dashboard, ${hiddenCards.length} hidden` : 'Customize dashboard'}
          title="Customize dashboard"
          className="relative inline-flex h-9 pointer-coarse:h-10 items-center justify-center gap-1.5 rounded-lg border border-primary-500/20 bg-primary-500/[0.07] px-2.5 t-meta font-display font-semibold text-primary-700 dark:text-primary-300 transition-colors cursor-pointer hover:bg-primary-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 sm:size-8 sm:px-0"
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

  const reset = () => {
    onReset();
    toast.success('Dashboard back to its default layout');
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary-500/30 bg-primary-500/[0.04] p-3 sm:px-4">
    <div role="status" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-primary-500 to-primary-700 text-white" aria-hidden="true">
          <LayoutGrid size={15} strokeWidth={2.25} />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="t-meta font-display font-bold text-text">Customize dashboard</span>
          <span className="t-meta font-medium text-text-muted">{touch ? 'Move cards up or down, or switch them off' : 'Drag a card by its grip to reorder, set its size, or hide it'}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center justify-center gap-1.5 h-10 sm:h-8 px-3 rounded-lg border border-border/70 bg-surface t-meta font-display font-semibold text-text-secondary hover:border-border-hover hover:text-text transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          <RotateCcw size={13} strokeWidth={2.25} aria-hidden="true" />
          Reset to default
        </button>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex items-center justify-center gap-1.5 h-10 sm:h-8 px-3.5 rounded-lg bg-linear-to-br from-primary-500 to-primary-700 t-meta font-display font-semibold text-white hover:opacity-95 transition-opacity cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          <Check size={13} strokeWidth={2.5} aria-hidden="true" />
          Done
        </button>
      </div>
    </div>
    {hiddenCards.length > 0 && (
      <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-primary-500/20">
        <span className="t-meta font-display font-semibold text-text-secondary">Hidden</span>
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
