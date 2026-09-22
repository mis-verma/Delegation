import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useSetChecklistInstanceItemDoneMutation } from '../hook';
import { DatePicker } from '../../../components';
import { ChecklistItemCardHeader } from './ChecklistItemCardHeader';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

interface ChecklistInstanceItemDateTimeCardProps {
  item:       ChecklistInstanceItem;
  instanceId: string;
  canWork:    boolean;
  isLocked:   boolean;
}

export const ChecklistInstanceItemDateTimeCard = ({ item, instanceId, canWork, isLocked }: ChecklistInstanceItemDateTimeCardProps) => {
  const setItemDone = useSetChecklistInstanceItemDoneMutation(instanceId);
  // Was a raw <input type="datetime-local"> — the shared DatePicker (used everywhere else a date
  // is picked in this app) works in real Date objects directly, so no timezone-string conversion
  // is needed here anymore.
  const [draft, setDraft] = useState<Date | null>(item.dateValue ? new Date(item.dateValue) : null);
  const interactive = canWork && !isLocked;
  const canSubmit = interactive && draft != null;

  return (
    <div className={`flex flex-col gap-3 p-4 rounded-lg border border-border bg-surface ${isLocked ? 'opacity-75' : ''}`}>
      <ChecklistItemCardHeader
        item={item}
        interactive={interactive}
        reopenPending={setItemDone.isPending}
        onReopen={() => setItemDone.mutate({ itemId: item.id, isDone: false, dateValue: draft ? draft.toISOString() : undefined })}
      />

      {/* The DatePicker itself is NOT gated on `interactive` — it's the only place this evidence
          is shown (there's no separate read-only display), so it must stay visible, just
          disabled, after the item (or the whole instance) locks. Only the Save button and the
          save-error message are for the still-editable case. */}
      <div className="flex flex-col gap-2">
        {interactive && setItemDone.isError && (
          <p className="text-xs text-danger">
            {setItemDone.error instanceof Error ? setItemDone.error.message : "Couldn't save that answer."}
          </p>
        )}

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
            <button
              onClick={() => canSubmit && setItemDone.mutate({ itemId: item.id, isDone: true, dateValue: draft!.toISOString() })}
              disabled={!canSubmit || setItemDone.isPending}
              className="flex items-center justify-center gap-1.5 text-xs font-display font-medium px-2.5 py-1.5 rounded-md border border-primary-500/50 text-primary-600 hover:bg-primary-500/10 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {setItemDone.isPending && <Loader2 size={12} className="animate-spin" />}
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
