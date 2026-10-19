import { memo, useId, useState } from 'react';
import { useSetChecklistInstanceItemDoneMutation } from '../hook';
import { Input } from '../../../components';
import { ChecklistItemCardHeader } from './ChecklistItemCardHeader';
import { ItemCardShell } from './ItemCardShell';
import { ItemError } from './ItemError';
import { ItemActionButton } from './ItemActionButton';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

interface ChecklistInstanceItemTextCardProps {
  item:       ChecklistInstanceItem;
  instanceId: string;
  canWork:    boolean;
  isLocked:   boolean;
}

export const ChecklistInstanceItemTextCard = memo(function ChecklistInstanceItemTextCard({ item, instanceId, canWork, isLocked }: ChecklistInstanceItemTextCardProps) {
  const inputId = useId();
  const setItemDone = useSetChecklistInstanceItemDoneMutation(instanceId);
  const [draft, setDraft] = useState(item.textValue ?? '');
  const interactive = canWork && !isLocked;
  const canSubmit = interactive && draft.trim().length > 0;

  return (
    <ItemCardShell isLocked={isLocked}>
      <ChecklistItemCardHeader
        item={item}
        interactive={interactive}
        reopenPending={setItemDone.isPending}
        onReopen={() => setItemDone.mutate({ itemId: item.id, isDone: false, textValue: draft })}
      />

      {!interactive && item.textValue && (
        <p className="text-sm font-display text-text px-3 py-2 rounded-lg bg-surface-hover/60 border border-border/60 whitespace-pre-wrap break-words">
          {item.textValue}
        </p>
      )}

      {interactive && (
        <div className="flex flex-col gap-2">
          <ItemError error={setItemDone.error} fallback="Couldn't save that answer." />

          <div className="flex items-center gap-2">
            <Input
              id={inputId}
              label="Answer"
              labelClassName="sr-only"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={item.isDone}
              placeholder="Type an answer…"
              containerClassName="flex-1 min-w-0"
              className="h-11 sm:h-9 rounded-lg"
            />
            {!item.isDone && (
              <ItemActionButton
                className="shrink-0"
                onClick={() => canSubmit && setItemDone.mutate({ itemId: item.id, isDone: true, textValue: draft.trim() })}
                disabled={!canSubmit}
                isLoading={setItemDone.isPending}
              >
                Save
              </ItemActionButton>
            )}
          </div>
        </div>
      )}
    </ItemCardShell>
  );
});
