import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useSetChecklistInstanceItemDoneMutation } from '../hook';
import { ChecklistItemCardHeader } from './ChecklistItemCardHeader';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

interface ChecklistInstanceItemNumberEntryCardProps {
  item:       ChecklistInstanceItem;
  instanceId: string;
  canWork:    boolean; // assignee or admin — allowed to submit a reading
  isLocked:   boolean; // instance already APPROVED — frozen, no further changes
}

// NUMBER_ENTRY counterpart to ChecklistInstanceItemCard — a reading instead of a checkbox/photo.
// The server (checklistInstance.service.ts's assertNumberEntrySatisfied) is the source of truth
// for the min/max check; this only mirrors it locally so the button can be disabled before a
// round trip, not to replace the server-side validation.
export const ChecklistInstanceItemNumberEntryCard = ({ item, instanceId, canWork, isLocked }: ChecklistInstanceItemNumberEntryCardProps) => {
  const setItemDone = useSetChecklistInstanceItemDoneMutation(instanceId);
  const [draftValue, setDraftValue] = useState(item.numericValue != null ? String(item.numericValue) : '');

  const interactive = canWork && !isLocked;
  const parsed = draftValue.trim() === '' ? null : Number(draftValue);
  const outOfRange =
    parsed != null &&
    ((item.numberEntryMin != null && parsed < item.numberEntryMin) ||
      (item.numberEntryMax != null && parsed > item.numberEntryMax));
  const canSubmit = interactive && parsed != null && !Number.isNaN(parsed) && !outOfRange;

  const rangeHint = [
    item.numberEntryMin != null ? `min ${item.numberEntryMin}` : null,
    item.numberEntryMax != null ? `max ${item.numberEntryMax}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className={`flex flex-col gap-3 p-4 rounded-lg border border-border bg-surface ${isLocked ? 'opacity-75' : ''}`}>
      <ChecklistItemCardHeader
        item={item}
        interactive={interactive}
        reopenPending={setItemDone.isPending}
        onReopen={() => setItemDone.mutate({ itemId: item.id, isDone: false, numericValue: parsed ?? undefined })}
        subtitle={(rangeHint || item.numberEntryUnit) && (
          <p className="text-[11px] text-text-muted font-display mt-0.5">
            {[rangeHint, item.numberEntryUnit].filter(Boolean).join(' · ')}
          </p>
        )}
      />

      {/* The reading input itself is NOT gated on `interactive` — it's the only place this
          evidence is shown (there's no separate read-only display), so it must stay visible,
          just disabled, after the item (or the whole instance) locks. Only the Save button and
          the save-error message are for the still-editable case. */}
      <div className="flex flex-col gap-2">
        {interactive && setItemDone.isError && (
          <p className="text-xs text-danger">
            {setItemDone.error instanceof Error ? setItemDone.error.message : "Couldn't save that reading."}
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="number"
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            disabled={!interactive || item.isDone}
            placeholder="Enter value"
            className="w-32 px-2.5 py-1.5 text-sm font-display bg-surface text-text rounded-md border border-border focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all disabled:opacity-60"
          />
          {item.numberEntryUnit && <span className="text-xs font-display text-text-muted">{item.numberEntryUnit}</span>}

          {interactive && !item.isDone && (
            <button
              onClick={() => parsed != null && setItemDone.mutate({ itemId: item.id, isDone: true, numericValue: parsed })}
              disabled={!canSubmit || setItemDone.isPending}
              className="flex items-center gap-1.5 text-xs font-display font-medium px-2.5 py-1.5 rounded-md border border-primary-500/50 text-primary-600 hover:bg-primary-500/10 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
            >
              {setItemDone.isPending && <Loader2 size={12} className="animate-spin" />}
              Save reading
            </button>
          )}
        </div>

        {interactive && outOfRange && (
          <p className="text-xs text-warning">That's outside the allowed range{rangeHint ? ` (${rangeHint})` : ''}.</p>
        )}
      </div>
    </div>
  );
};
