import { Check, Eye, EyeOff, GripVertical, LayoutGrid, Maximize2, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { IconChip } from '../../components/iconChip';

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
          className="group inline-flex h-10 sm:h-9 items-center justify-center gap-2 rounded-full border border-primary-500/25 bg-primary-500/8 pl-1.5 pr-3.5 t-meta font-display font-semibold text-primary-700 dark:text-primary-300 transition-all duration-200 cursor-pointer hover:border-primary-500/50 hover:bg-primary-500/15 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          <span className="flex size-7 sm:size-6 items-center justify-center rounded-full bg-linear-to-br from-primary-500 to-primary-700 text-white transition-transform duration-300 group-hover:rotate-90" aria-hidden="true">
            <SlidersHorizontal className="size-3.5" strokeWidth={2.5} />
          </span>
          Customize
          {hiddenCards.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-600 px-1.5 t-meta font-display font-bold leading-none text-white tabular-nums" aria-hidden="true">
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
    <div className="animate-in fade-in slide-in-from-top-2 duration-200 flex flex-col gap-3 rounded-xl border border-primary-500/30 bg-linear-to-br from-primary-500/8 to-transparent p-3 sm:p-4">
      <div role="status" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-primary-500 to-primary-700 text-white" aria-hidden="true">
            <LayoutGrid size={18} strokeWidth={2.25} />
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="t-card font-display font-bold text-text">Customize your dashboard</span>
            <div className="flex flex-wrap gap-1.5">
              {touch ? (
                <>
                  <IconChip icon={GripVertical} tone="bg-primary-600" label="Move up or down" />
                  <IconChip icon={EyeOff} tone="bg-text-muted" label="Switch off" />
                </>
              ) : (
                <>
                  <IconChip icon={GripVertical} tone="bg-primary-600" label="Drag to reorder" />
                  <IconChip icon={Maximize2} tone="bg-info" label="Set the size" />
                  <IconChip icon={EyeOff} tone="bg-text-muted" label="Hide" />
                </>
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center gap-1.5 h-11 sm:h-9 px-3.5 rounded-lg border border-border/70 bg-surface t-meta font-display font-semibold text-text-secondary transition-all duration-200 cursor-pointer hover:border-border-hover hover:text-text active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <RotateCcw size={14} strokeWidth={2.25} aria-hidden="true" />
            Reset
          </button>
          <button
            type="button"
            onClick={onDone}
            className="inline-flex items-center justify-center gap-1.5 h-11 sm:h-9 px-4 rounded-lg bg-linear-to-br from-primary-500 to-primary-700 t-meta font-display font-semibold text-white transition-all duration-200 cursor-pointer hover:opacity-95 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <Check size={14} strokeWidth={2.5} aria-hidden="true" />
            Done
          </button>
        </div>
      </div>

      {hiddenCards.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-primary-500/20 pt-3">
          <span className="inline-flex items-center gap-1.5 t-meta font-display font-semibold text-text-secondary">
            <EyeOff size={13} strokeWidth={2.25} aria-hidden="true" />
            Hidden
          </span>
          {hiddenCards.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => onShow(card.id)}
              title={`Show ${card.label}`}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-border bg-surface t-meta font-display font-semibold text-text-secondary transition-all duration-200 cursor-pointer hover:border-primary-500/40 hover:bg-surface-hover hover:text-text active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <Eye size={13} strokeWidth={2.25} aria-hidden="true" />
              {card.label}
            </button>
          ))}
          {hiddenCards.length > 1 && (
            <button
              type="button"
              onClick={() => hiddenCards.forEach((card) => onShow(card.id))}
              className="inline-flex items-center h-9 px-2 t-meta font-display font-semibold text-primary-600 dark:text-primary-400 transition-colors cursor-pointer hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded-lg"
            >
              Show all
            </button>
          )}
        </div>
      )}
    </div>
  );
};
