import { memo, useState } from 'react';
import { useSetChecklistInstanceItemDoneMutation } from '../hook';
import { DatePicker } from '../../../components';
import { ChecklistItemCardHeader } from './ChecklistItemCardHeader';
import { ItemCardShell } from './ItemCardShell';
import { ItemError } from './ItemError';
import { ItemActionButton } from './ItemActionButton';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

interface ChecklistInstanceItemDateTimeCardProps {
  item:       ChecklistInstanceItem;
  instanceId: string;
  canWork:    boolean;
  isLocked:   boolean;
}

export const ChecklistInstanceItemDateTimeCard = memo(function ChecklistInstanceItemDateTimeCard({ item, instanceId, canWork, isLocked }: ChecklistInstanceItemDateTimeCardProps) {
  const setItemDone = useSetChecklistInstanceItemDoneMutation(instanceId);
  const [draft, setDraft] = useState<Date | null>(item.dateValue ? new Date(item.dateValue) : null);
  const interactive = canWork && !isLocked;
  const canSubmit = interactive && draft != null;

  return (
    <ItemCardShell isLocked={isLocked}>
      <ChecklistItemCardHeader
        item={item}
        interactive={interactive}
        reopenPending={setItemDone.isPending}
        onReopen={() => setItemDone.mutate({ itemId: item.id, isDone: false, dateValue: draft ? draft.toISOString() : undefined })}
      />

      <div className="flex flex-col gap-2">
        {interactive && <ItemError error={setItemDone.error} fallback="Couldn't save that answer." />}

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <DatePicker
            value={draft}
            onChange={setDraft}
            showTime
            disabled={!interactive || item.isDone}
            placeholder="Select date & time"
            className="w-full sm:w-64"
          />
          {interactive && !item.isDone && (
            <ItemActionButton
              className="shrink-0"
              onClick={() => canSubmit && setItemDone.mutate({ itemId: item.id, isDone: true, dateValue: draft!.toISOString() })}
              disabled={!canSubmit}
              isLoading={setItemDone.isPending}
            >
              Save
            </ItemActionButton>
          )}
        </div>
      </div>
    </ItemCardShell>
  );
});
