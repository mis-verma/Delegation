import { Check, Eye, EyeOff, GripVertical, LayoutGrid, Maximize2, RotateCcw, SlidersHorizontal } from 'lucide-react';
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

const TIP = 'inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-surface px-2.5 py-1 t-meta font-display font-semibold text-text-secondary';

export const DashboardLayoutToolbar = ({ isCustomizing, onStart, onReset, onDone, hiddenCards, onShow, touch = false }: DashboardLayoutToolbarProps) => {
  if (!isCustomizing) {
    return (
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={onStart}
          aria-label={hiddenCards.length > 0 ? `Customize dashboard, ${hiddenCards.length} hidden` : 'Customize dashboard'}
          className="group inline-flex h-11 items-center justify-center gap-2.5 rounded-full border border-border bg-surface pl-1.5 pr-4 t-meta font-display font-bold text-text outline-none transition-all duration-200 cursor-pointer hover:border-vivid-blue/60 hover:bg-vivid-blue/5 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary-500/50 sm:h-10"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-vivid-blue text-white transition-transform duration-300 group-hover:rotate-90 sm:size-7" aria-hidden="true">
            <SlidersHorizontal className="size-4" strokeWidth={2.5} />
          </span>
          Customize
          {hiddenCards.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-vivid-red px-1.5 t-meta font-display font-bold leading-none text-white tabular-nums" aria-hidden="true">
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
    <div className="sticky top-0 z-30 animate-in fade-in slide-in-from-top-2 duration-200 flex flex-col gap-3 rounded-2xl border border-vivid-blue/30 bg-surface/95 p-3 backdrop-blur-md sm:p-4">
      <div role="status" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-vivid-blue text-white" aria-hidden="true">
            <LayoutGrid size={20} strokeWidth={2.25} />
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="t-card font-display font-bold text-text">Customize your dashboard</span>
            <div className="flex flex-wrap gap-1.5">
              {touch ? (
                <>
                  <span className={TIP}><GripVertical size={12} className="text-vivid-blue-text" aria-hidden="true" />Move up or down</span>
                  <span className={TIP}><EyeOff size={12} className="text-text-muted" aria-hidden="true" />Switch off</span>
                </>
              ) : (
                <>
                  <span className={TIP}><GripVertical size={12} className="text-vivid-blue-text" aria-hidden="true" />Drag to reorder</span>
                  <span className={TIP}><Maximize2 size={12} className="text-vivid-sky-text" aria-hidden="true" />Set the size</span>
                  <span className={TIP}><EyeOff size={12} className="text-text-muted" aria-hidden="true" />Hide</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-4 t-meta font-display font-semibold text-text-secondary outline-none transition-all duration-200 cursor-pointer hover:border-border-hover hover:text-text active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary-500/50 sm:h-10"
          >
            <RotateCcw size={14} strokeWidth={2.25} aria-hidden="true" />
            Reset
          </button>
          <button
            type="button"
            onClick={onDone}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-vivid-green px-5 t-meta font-display font-bold text-on-vivid outline-none transition-all duration-200 cursor-pointer hover:brightness-105 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary-500/50 sm:h-10"
          >
            <Check size={15} strokeWidth={3} aria-hidden="true" />
            Done
          </button>
        </div>
      </div>

      {hiddenCards.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
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
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 t-meta font-display font-semibold text-text-secondary outline-none transition-all duration-200 cursor-pointer hover:border-vivid-blue/50 hover:bg-vivid-blue/5 hover:text-text active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-primary-500/50"
            >
              <Eye size={13} strokeWidth={2.25} aria-hidden="true" />
              {card.label}
            </button>
          ))}
          {hiddenCards.length > 1 && (
            <button
              type="button"
              onClick={() => hiddenCards.forEach((card) => onShow(card.id))}
              className="inline-flex h-10 items-center rounded-lg px-2 t-meta font-display font-bold text-vivid-blue-text outline-none transition-colors cursor-pointer hover:underline focus-visible:ring-2 focus-visible:ring-primary-500/50"
            >
              Show all
            </button>
          )}
        </div>
      )}
    </div>
  );
};
