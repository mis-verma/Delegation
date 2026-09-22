import { LayoutGrid, RotateCcw, Check } from 'lucide-react';

interface DashboardLayoutToolbarProps {
  isCustomizing: boolean;
  onStart: () => void;
  onReset: () => void;
  onDone: () => void;
}

// One entry point for the whole feature: a quiet ghost button at rest, becoming the active-mode
// toolbar (what's happening + the two ways out — start fresh, or keep it) once customizing starts.
// Same bar, same position, so nothing jumps around the moment the mode flips.
export const DashboardLayoutToolbar = ({ isCustomizing, onStart, onReset, onDone }: DashboardLayoutToolbarProps) => {
  if (!isCustomizing) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onStart}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-surface text-xs font-display font-semibold text-text-secondary hover:bg-surface-hover hover:text-text transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          <LayoutGrid size={13} strokeWidth={2.25} />
          Customize layout
        </button>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-xl border border-dashed border-primary-500/60 bg-primary-500/5"
    >
      <div className="flex items-center gap-2 text-xs font-display font-semibold text-primary-700 dark:text-primary-300">
        <LayoutGrid size={14} strokeWidth={2.25} className="text-primary-600 dark:text-primary-300 shrink-0" />
        Customizing layout — drag a card by its grip, or set its size
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-surface text-xs font-display font-semibold text-text-secondary hover:bg-surface-hover hover:text-text transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          <RotateCcw size={13} strokeWidth={2.25} />
          Reset to default
        </button>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-primary-600 text-xs font-display font-semibold text-white hover:bg-primary-700 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          <Check size={13} strokeWidth={2.5} />
          Done
        </button>
      </div>
    </div>
  );
};
