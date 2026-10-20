import { memo, useState } from 'react';
import { UndoStrip } from './UndoStrip';
import { useUndoableAnswer } from './useUndoableAnswer';
import { haptic } from '../../../lib/haptics';
import { Star } from 'lucide-react';
import { useSetChecklistInstanceItemDoneMutation } from '../hook';
import { ChecklistItemCardHeader } from './ChecklistItemCardHeader';
import { ItemCardShell } from './ItemCardShell';
import { ItemError } from './ItemError';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

interface ChecklistInstanceItemRatingCardProps {
  item:       ChecklistInstanceItem;
  instanceId: string;
  canWork:    boolean;
  isLocked:   boolean;
}

export const ChecklistInstanceItemRatingCard = memo(function ChecklistInstanceItemRatingCard({ item, instanceId, canWork, isLocked }: ChecklistInstanceItemRatingCardProps) {
  const setItemDone = useSetChecklistInstanceItemDoneMutation(instanceId);
  const [hovered, setHovered] = useState<number | null>(null);
  const undoable = useUndoableAnswer<number>((value) => setItemDone.mutate({ itemId: item.id, isDone: true, numericValue: value }), item.isDone);
  const scale = item.ratingScale ?? 5;
  const interactive = canWork && !isLocked && !item.isDone;

  const submit = (value: number) => {
    if (!interactive || setItemDone.isPending || value === undoable.queued) return;
    haptic('tap');
    undoable.queue(value);
  };

  return (
    <ItemCardShell isLocked={isLocked}>
      <ChecklistItemCardHeader
        item={item}
        interactive={canWork && !isLocked}
        reopenPending={setItemDone.isPending}
        onReopen={() => { undoable.clear(); setItemDone.mutate({ itemId: item.id, isDone: false, numericValue: item.numericValue ?? undefined }); }}
      />

      <ItemError error={setItemDone.error} fallback="Couldn't save that rating." />

      {!item.isDone && item.numericValue != null && interactive && (
        <p className="t-meta text-text-muted">Reopened. It was rated {item.numericValue} out of {scale} before. Rate it again.</p>
      )}

      <div className="flex items-center gap-2">
        <div className="flex items-center" aria-busy={setItemDone.isPending} onMouseLeave={() => setHovered(null)}>
          {Array.from({ length: scale }, (_, i) => i + 1).map((value) => {
            const filled = value <= (hovered ?? undoable.queued ?? (item.isDone ? item.numericValue ?? 0 : 0));
            return (
              <button
                key={value}
                type="button"
                disabled={!interactive}
                onClick={() => submit(value)}
                onMouseEnter={() => interactive && setHovered(value)}
                aria-label={`Rate ${value} out of ${scale}`}
                className={`flex items-center justify-center size-11 sm:size-8 rounded-md transition-transform outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 ${interactive ? 'cursor-pointer hover:scale-110' : 'cursor-not-allowed'}`}
              >
                <Star
                  size={22}
                  className={filled ? 'text-warning fill-warning' : 'text-border'}
                  strokeWidth={1.5}
                />
              </button>
            );
          })}
        </div>
        {item.numericValue != null && (
          <span className="t-meta font-display text-text-muted">{item.numericValue}/{scale}</span>
        )}
      </div>
      <UndoStrip queued={undoable.queued !== null && !item.isDone} saved={undoable.saved} label={`Rated ${undoable.queued} out of ${scale}`} onUndo={undoable.undo} />
    </ItemCardShell>
  );
});
