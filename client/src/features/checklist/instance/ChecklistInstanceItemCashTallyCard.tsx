import { memo, useId, useState } from 'react';
import { useSetChecklistInstanceItemDoneMutation } from '../hook';
import { Input, Textarea } from '../../../components';
import { ChecklistItemCardHeader } from './ChecklistItemCardHeader';
import { ItemCardShell } from './ItemCardShell';
import { ItemError } from './ItemError';
import { ItemActionButton } from './ItemActionButton';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

interface ChecklistInstanceItemCashTallyCardProps {
  item:       ChecklistInstanceItem;
  instanceId: string;
  canWork:    boolean;
  isLocked:   boolean;
}

// NUMBER_ENTRY sibling — same numericValue field and range validation (see
// ChecklistInstanceItemNumberEntryCard), plus a display-only variance line against the
// definition-authored cashExpectedAmount, when set.
export const ChecklistInstanceItemCashTallyCard = memo(function ChecklistInstanceItemCashTallyCard({ item, instanceId, canWork, isLocked }: ChecklistInstanceItemCashTallyCardProps) {
  const inputId = useId();
  const reasonId = useId();
  const setItemDone = useSetChecklistInstanceItemDoneMutation(instanceId);
  const [draftValue, setDraftValue] = useState(item.numericValue != null ? String(item.numericValue) : '');

  const interactive = canWork && !isLocked;
  const parsed = draftValue.trim() === '' ? null : Number(draftValue);
  const outOfRange =
    parsed != null &&
    ((item.numberEntryMin != null && parsed < item.numberEntryMin) ||
      (item.numberEntryMax != null && parsed > item.numberEntryMax));
  const variance = parsed != null && item.cashExpectedAmount != null ? parsed - item.cashExpectedAmount : null;
  // A short or over drawer now needs a reason (the server enforces it too) — it used to save
  // exactly like a matching count.
  const [reason, setReason] = useState(item.conditionalReasonValue ?? '');
  const needsReason = variance != null && variance !== 0;
  const canSubmit = interactive && parsed != null && !Number.isNaN(parsed) && !outOfRange && (!needsReason || reason.trim().length > 0);
  const unit = item.numberEntryUnit ? `${item.numberEntryUnit} ` : '';

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
        subtitle={item.cashExpectedAmount != null && (
          <p className="t-meta text-text-muted font-display">
            Expected {unit}{item.cashExpectedAmount.toLocaleString()}
          </p>
        )}
      />

      {/* The counted amount input itself is NOT gated on `interactive` — it's the only place this
          evidence is shown (there's no separate read-only display), so it must stay visible,
          just disabled, after the item (or the whole instance) locks. Only the Save button and
          the save-error message are for the still-editable case. */}
      <div className="flex flex-col gap-2">
        {interactive && <ItemError error={setItemDone.error} fallback="Couldn't save that count." />}

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Input
            id={inputId}
            label="Counted amount"
            labelClassName="sr-only"
            type="number"
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            disabled={!interactive || item.isDone}
            placeholder="Counted amount"
            suffix={item.numberEntryUnit ? <span className="text-xs font-display text-text-muted">{item.numberEntryUnit}</span> : undefined}
            containerClassName="w-44"
            className={item.numberEntryUnit ? 'h-11 sm:h-9 rounded-lg pr-14' : 'h-11 sm:h-9 rounded-lg'}
          />

          {interactive && !item.isDone && (
            <ItemActionButton
              onClick={() => parsed != null && setItemDone.mutate({
                itemId: item.id,
                isDone: true,
                numericValue: parsed,
                ...(needsReason ? { conditionalReasonValue: reason.trim() } : {}),
              })}
              disabled={!canSubmit}
              isLoading={setItemDone.isPending}
            >
              Save count
            </ItemActionButton>
          )}
        </div>

        {needsReason && (
          <p className={`text-xs font-display font-medium ${(variance ?? 0) > 0 ? 'text-warning' : 'text-danger'}`}>
            {(variance ?? 0) > 0 ? 'Over' : 'Short'} by {unit}{Math.abs(variance ?? 0).toLocaleString()}
          </p>
        )}
        {needsReason && interactive && !item.isDone && (
          <Textarea
            id={reasonId}
            label="Reason for the difference"
            labelClassName="sr-only"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Why doesn't the count match? (required)"
            className="min-h-0 px-3 py-2 rounded-lg resize-none"
          />
        )}
        {item.isDone && item.conditionalReasonValue && (
          <p className="text-xs font-display text-text-secondary px-3 py-2 rounded-lg bg-surface-hover/60 border border-border/60">
            <span className="font-semibold text-text">Reason: </span>{item.conditionalReasonValue}
          </p>
        )}
        {interactive && outOfRange && (
          <p className="text-xs text-warning">That's outside the allowed range{rangeHint ? ` (${rangeHint})` : ''}.</p>
        )}
      </div>
    </ItemCardShell>
  );
});
