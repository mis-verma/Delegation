import { memo, useId, useState } from 'react';
import { useSetChecklistInstanceItemDoneMutation } from '../hook';
import { Input } from '../../../components';
import { ChecklistItemCardHeader } from './ChecklistItemCardHeader';
import { ItemCardShell } from './ItemCardShell';
import { ItemError } from './ItemError';
import { ItemActionButton } from './ItemActionButton';
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
export const ChecklistInstanceItemNumberEntryCard = memo(function ChecklistInstanceItemNumberEntryCard({ item, instanceId, canWork, isLocked }: ChecklistInstanceItemNumberEntryCardProps) {
  const inputId = useId();
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
    <ItemCardShell isLocked={isLocked}>
      <ChecklistItemCardHeader
        item={item}
        interactive={interactive}
        reopenPending={setItemDone.isPending}
        onReopen={() => setItemDone.mutate({ itemId: item.id, isDone: false, numericValue: parsed ?? undefined })}
        subtitle={(rangeHint || item.numberEntryUnit) && (
          <p className="text-[11px] text-text-muted font-display">
            {[rangeHint, item.numberEntryUnit].filter(Boolean).join(' · ')}
          </p>
        )}
      />

      {/* The reading input itself is NOT gated on `interactive` — it's the only place this
          evidence is shown (there's no separate read-only display), so it must stay visible,
          just disabled, after the item (or the whole instance) locks. Only the Save button and
          the save-error message are for the still-editable case. */}
      <div className="flex flex-col gap-2">
        {interactive && <ItemError error={setItemDone.error} fallback="Couldn't save that reading." />}

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Input
            id={inputId}
            label="Reading"
            labelClassName="sr-only"
            type="number"
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            disabled={!interactive || item.isDone}
            placeholder="Enter value"
            suffix={item.numberEntryUnit ? <span className="text-xs font-display text-text-muted">{item.numberEntryUnit}</span> : undefined}
            containerClassName="w-44"
            className={item.numberEntryUnit ? 'h-11 sm:h-9 rounded-lg pr-14' : 'h-11 sm:h-9 rounded-lg'}
          />

          {interactive && !item.isDone && (
            <ItemActionButton
              onClick={() => parsed != null && setItemDone.mutate({ itemId: item.id, isDone: true, numericValue: parsed })}
              disabled={!canSubmit}
              isLoading={setItemDone.isPending}
            >
              Save reading
            </ItemActionButton>
          )}
        </div>

        {interactive && outOfRange && (
          <p className="text-xs text-warning">That's outside the allowed range{rangeHint ? ` (${rangeHint})` : ''}.</p>
        )}
      </div>
    </ItemCardShell>
  );
});
