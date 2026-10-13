import { memo, useState } from 'react';
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
  canWork:    boolean; // assignee or admin — allowed to submit a rating
  isLocked:   boolean; // instance already APPROVED — frozen, no further changes
}

// RATING counterpart to ChecklistInstanceItemNumberEntryCard — same numericValue field, rendered
// as stars (1..ratingScale) instead of a free-form number input. Picking a star submits
// immediately, matching the plain STANDARD item's "click to toggle" snappiness rather than
// requiring a separate save step. The stars fill at once (the hook updates the card optimistically),
// so there is no spinner.
export const ChecklistInstanceItemRatingCard = memo(function ChecklistInstanceItemRatingCard({ item, instanceId, canWork, isLocked }: ChecklistInstanceItemRatingCardProps) {
  const setItemDone = useSetChecklistInstanceItemDoneMutation(instanceId);
  const [hovered, setHovered] = useState<number | null>(null);
  const scale = item.ratingScale ?? 5;
  const interactive = canWork && !isLocked && !item.isDone;

  const submit = (value: number) => {
    if (!interactive || setItemDone.isPending) return;
    haptic('tap');
    setItemDone.mutate({ itemId: item.id, isDone: true, numericValue: value });
  };

  return (
    <ItemCardShell isLocked={isLocked}>
      <ChecklistItemCardHeader
        item={item}
        interactive={canWork && !isLocked}
        reopenPending={setItemDone.isPending}
        onReopen={() => setItemDone.mutate({ itemId: item.id, isDone: false, numericValue: item.numericValue ?? undefined })}
      />

      <ItemError error={setItemDone.error} fallback="Couldn't save that rating." />

      {!item.isDone && item.numericValue != null && interactive && (
        <p className="t-meta text-text-muted">Reopened. It was rated {item.numericValue} out of {scale} before. Rate it again.</p>
      )}

      <div className="flex items-center gap-2">
        <div className="flex items-center" aria-busy={setItemDone.isPending} onMouseLeave={() => setHovered(null)}>
          {Array.from({ length: scale }, (_, i) => i + 1).map((value) => {
            // A reopened rating starts empty again; its old value is mentioned above the stars.
            const filled = value <= (hovered ?? (item.isDone ? item.numericValue ?? 0 : 0));
            return (
              <button
                key={value}
                type="button"
                disabled={!interactive}
                onClick={() => submit(value)}
                onMouseEnter={() => interactive && setHovered(value)}
                aria-label={`Rate ${value} out of ${scale}`}
                // 44px hit area on touch; the star itself stays 22px.
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
          <span className="text-xs font-display text-text-muted">{item.numericValue}/{scale}</span>
        )}
      </div>
    </ItemCardShell>
  );
});
