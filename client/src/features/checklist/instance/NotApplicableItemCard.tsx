import { Ban, RotateCcw, Loader2 } from 'lucide-react';
import { useSetChecklistInstanceItemDoneMutation } from '../hook';
import { formatDate } from '../checklistDisplay';
import { useCanReopen } from './useCanReopen';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

interface NotApplicableItemCardProps {
  item: ChecklistInstanceItem;
  instanceId: string;
  /** canWork && !isLocked — shows "Undo" (to an admin, or to anyone once a reject reopened it). */
  canEdit: boolean;
}

/**
 * Stands in for an item's own card once it's marked Not applicable. The type card (photo slots,
 * Yes/No buttons, number box…) would otherwise sit there empty yet "done", which reads as a bug;
 * this says plainly that the step was skipped on purpose, and why.
 */
export const NotApplicableItemCard = ({ item, instanceId, canEdit }: NotApplicableItemCardProps) => {
  const mutation = useSetChecklistInstanceItemDoneMutation(instanceId);
  // Marked-not-applicable is finished work like any other: only an admin can take it back. The one
  // exception is a run a reviewer sent back, which reopens every step (isDone false) so its owner
  // can answer it properly this time.
  const canReopen = useCanReopen();
  const canUndo = canEdit && (!item.isDone || canReopen);

  return (
    <div className="flex flex-col gap-2.5 p-3.5 sm:p-4 rounded-lg border border-dashed border-border-hover bg-surface-hover/40">
      <div className="flex items-start gap-3">
        <span className="flex items-center justify-center size-9 rounded-md shrink-0 bg-surface border border-border text-text-muted">
          <Ban size={16} strokeWidth={2.25} />
        </span>
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <p className="text-sm font-display font-medium leading-snug text-text-secondary">{item.label}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-surface border border-border text-[11px] font-display font-semibold text-text-secondary">
              <Ban size={11} strokeWidth={2.5} />
              Not applicable
            </span>
            {item.completedAt && (
              <span className="text-[11px] font-medium text-text-muted">Marked {formatDate(item.completedAt)}</span>
            )}
          </div>
        </div>
        {canUndo && (
          <button
            type="button"
            onClick={() => mutation.mutate({ itemId: item.id, isDone: false })}
            disabled={mutation.isPending}
            className="inline-flex items-center gap-1 h-8 px-2.5 shrink-0 rounded-full text-xs font-display font-semibold text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150 cursor-pointer disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            title="Put this step back to answer it normally"
          >
            {mutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
            Undo
          </button>
        )}
      </div>

      {item.remarks?.trim() && (
        <p className="sm:ml-12 px-3 py-2 rounded-lg bg-surface border border-border/60 dark:border-white/[0.06] text-xs text-text-secondary leading-relaxed whitespace-pre-wrap break-words">
          <span className="font-display font-semibold text-text-muted">Reason: </span>
          {item.remarks}
        </p>
      )}
    </div>
  );
};
