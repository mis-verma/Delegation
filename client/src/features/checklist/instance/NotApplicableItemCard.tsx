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
  canEdit: boolean;
}

export const NotApplicableItemCard = memo(function NotApplicableItemCard({ item, instanceId, canEdit }: NotApplicableItemCardProps) {
  const mutation = useSetChecklistInstanceItemDoneMutation(instanceId);
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
                <span className="t-meta font-medium text-text-muted">Marked {formatDateTime(item.completedAt)}{item.completedByName ? ` by ${item.completedByName}` : ''}</span>
              )}
            </div>
          </div>
          {reason && (
            <p className="px-3 py-2 rounded-lg bg-surface border border-border/60 t-meta text-text-secondary leading-relaxed whitespace-pre-wrap break-words">
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
