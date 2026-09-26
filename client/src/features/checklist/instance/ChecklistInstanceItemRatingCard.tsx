import { useState } from 'react';
import { Star, Loader2 } from 'lucide-react';
import { useSetChecklistInstanceItemDoneMutation } from '../hook';
import { ChecklistItemCardHeader } from './ChecklistItemCardHeader';
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
// requiring a separate save step.
export const ChecklistInstanceItemRatingCard = ({ item, instanceId, canWork, isLocked }: ChecklistInstanceItemRatingCardProps) => {
  const setItemDone = useSetChecklistInstanceItemDoneMutation(instanceId);
  const [hovered, setHovered] = useState<number | null>(null);
  const scale = item.ratingScale ?? 5;
  const interactive = canWork && !isLocked && !item.isDone;

  const submit = (value: number) => {
    if (!interactive || setItemDone.isPending) return;
    setItemDone.mutate({ itemId: item.id, isDone: true, numericValue: value });
  };

  return (
    <div className={`flex flex-col gap-3 p-3.5 sm:p-4 rounded-2xl border border-border/60 dark:border-white/[0.06] bg-surface ${isLocked ? 'opacity-75' : ''}`}>
      <ChecklistItemCardHeader
        item={item}
        interactive={canWork && !isLocked}
        reopenPending={setItemDone.isPending}
        onReopen={() => setItemDone.mutate({ itemId: item.id, isDone: false, numericValue: item.numericValue ?? undefined })}
      />

      {setItemDone.isError && (
        <p className="text-xs text-danger">
          {setItemDone.error instanceof Error ? setItemDone.error.message : "Couldn't save that rating."}
        </p>
      )}

      <div className="flex items-center gap-1" onMouseLeave={() => setHovered(null)}>
        {Array.from({ length: scale }, (_, i) => i + 1).map((value) => {
          const filled = value <= (hovered ?? item.numericValue ?? 0);
          return (
            <button
              key={value}
              type="button"
              disabled={!interactive}
              onClick={() => submit(value)}
              onMouseEnter={() => interactive && setHovered(value)}
              aria-label={`Rate ${value} out of ${scale}`}
              className={`rounded-md transition-transform outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 ${interactive ? 'cursor-pointer hover:scale-110' : 'cursor-not-allowed'}`}
            >
              <Star
                size={22}
                className={filled ? 'text-warning fill-warning' : 'text-border'}
                strokeWidth={1.5}
              />
            </button>
          );
        })}
        {setItemDone.isPending && <Loader2 size={14} className="animate-spin text-text-muted ml-1" />}
        {item.numericValue != null && (
          <span className="text-xs font-display text-text-muted ml-2">{item.numericValue}/{scale}</span>
        )}
      </div>
    </div>
  );
};
