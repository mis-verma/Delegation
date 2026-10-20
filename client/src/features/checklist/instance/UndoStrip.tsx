import { Check, Undo2 } from 'lucide-react';
import { haptic } from '../../../lib/haptics';
import { UNDO_WINDOW_MS } from './useUndoableAnswer';

interface UndoStripProps {
  queued: boolean;
  saved: boolean;
  label: string;
  onUndo: () => void;
}

export const UndoStrip = ({ queued, saved, label, onUndo }: UndoStripProps) => {
  if (queued) {
    return (
      <div role="status" className="flex flex-col gap-1.5 overflow-hidden rounded-xl border border-border bg-surface-hover/50 px-3 pt-2 sm:max-w-md">
        <div className="flex items-center justify-between gap-3">
          <p className="t-meta font-display font-semibold text-text-secondary">{label}. Saving in a moment.</p>
          <button
            type="button"
            onClick={() => { haptic('tap'); onUndo(); }}
            className="inline-flex h-9 pointer-coarse:h-11 shrink-0 items-center gap-1.5 rounded-lg px-2.5 t-meta font-display font-bold text-primary-700 transition-colors duration-150 hover:bg-surface-active cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:text-primary-300"
          >
            <Undo2 className="size-3.5" aria-hidden="true" />
            Undo
          </button>
        </div>
        <span
          key={label}
          aria-hidden="true"
          className="-mx-3 block h-0.5 origin-left bg-primary-500/70 motion-reduce:hidden"
          style={{ animation: `undo-shrink ${UNDO_WINDOW_MS}ms linear forwards` }}
        />
      </div>
    );
  }
  if (saved) {
    return (
      <p role="status" className="inline-flex w-fit items-center gap-1.5 t-meta font-display font-semibold text-success">
        <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
        Saved
      </p>
    );
  }
  return null;
};
