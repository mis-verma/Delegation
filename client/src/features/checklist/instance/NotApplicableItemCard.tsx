import { memo } from 'react';
import { Ban, RotateCcw } from 'lucide-react';
import { useSetChecklistInstanceItemDoneMutation } from '../hook';
import { Button } from '../../../components';
import { Badge } from '../../../components/ui/badge';
import { formatDateTime } from '../checklistDisplay';
import { useCanReopen } from './useCanReopen';
import { ItemCardShell } from './ItemCardShell';
import { ChecklistItemIconTile } from './ChecklistItemIconTile';
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
export const NotApplicableItemCard = memo(function NotApplicableItemCard({ item, instanceId, canEdit }: NotApplicableItemCardProps) {
  const mutation = useSetChecklistInstanceItemDoneMutation(instanceId);
  // Marked-not-applicable is finished work like any other: only an admin can take it back. The one
  // exception is a run a reviewer sent back, which reopens every step (isDone false) so its owner
  // can answer it properly this time.
  const canReopen = useCanReopen();
  const canUndo = canEdit && (!item.isDone || canReopen);
  const reason = item.remarks?.trim();

  return (
    <ItemCardShell isLocked={false} dashed>
      <div className="flex items-start gap-3">
        <ChecklistItemIconTile icon={Ban} done={false} />
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-display font-medium leading-snug text-text-secondary">{item.label}</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Badge variant="neutral">
                <Ban aria-hidden />
                Not applicable
              </Badge>
              {item.completedAt && (
                <span className="text-[11px] font-medium text-text-muted">Marked {formatDateTime(item.completedAt)}{item.completedByName ? ` by ${item.completedByName}` : ''}</span>
              )}
            </div>
          </div>
          {reason && (
            <p className="px-3 py-2 rounded-lg bg-surface border border-border/60 text-xs text-text-secondary leading-relaxed whitespace-pre-wrap break-words">
              <span className="font-display font-semibold text-text-muted">Reason: </span>
              {reason}
            </p>
          )}
        </div>
        {canUndo && (
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => mutation.mutate({ itemId: item.id, isDone: false })}
            isLoading={mutation.isPending}
            title="Put this step back to answer it normally"
          >
            {!mutation.isPending && <RotateCcw size={13} aria-hidden />}
            Undo
          </Button>
        )}
      </div>
    </ItemCardShell>
  );
});
