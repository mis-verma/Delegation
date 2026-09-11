import { useSetChecklistInstanceItemDoneMutation } from '../hook';
import { ChecklistItemCardHeader } from './ChecklistItemCardHeader';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

interface ChecklistInstanceItemChoiceCardProps {
  item:       ChecklistInstanceItem;
  instanceId: string;
  canWork:    boolean;
  isLocked:   boolean;
}

// Shared by MULTIPLE_CHOICE and DROPDOWN — same options list and textValue field, only the
// picker widget differs (chip buttons vs a native <select>), matching how the two read in the
// reference design (a chip row reads better inline than a dropdown once there are only a
// handful of options, but DROPDOWN keeps the compact native control it's named for).
export const ChecklistInstanceItemChoiceCard = ({ item, instanceId, canWork, isLocked }: ChecklistInstanceItemChoiceCardProps) => {
  const setItemDone = useSetChecklistInstanceItemDoneMutation(instanceId);
  const interactive = canWork && !isLocked;
  const options = item.options ?? [];

  const choose = (value: string) => {
    if (!interactive || setItemDone.isPending || !value) return;
    setItemDone.mutate({ itemId: item.id, isDone: true, textValue: value });
  };

  return (
    <div className={`flex flex-col gap-3 p-4 rounded-lg border border-border bg-surface ${isLocked ? 'opacity-75' : ''}`}>
      <ChecklistItemCardHeader
        item={item}
        interactive={interactive}
        reopenPending={setItemDone.isPending}
        onReopen={() => setItemDone.mutate({ itemId: item.id, isDone: false, textValue: item.textValue ?? undefined })}
      />

      {setItemDone.isError && (
        <p className="text-xs text-danger">
          {setItemDone.error instanceof Error ? setItemDone.error.message : 'Could not save this answer.'}
        </p>
      )}

      {item.itemType === 'DROPDOWN' ? (
        <select
          value={item.textValue ?? ''}
          disabled={!interactive}
          onChange={(e) => choose(e.target.value)}
          className="w-full px-2.5 py-1.5 text-sm font-display bg-surface text-text rounded-md border border-border focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all disabled:opacity-60"
        >
          <option value="" disabled>Select an option…</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              disabled={!interactive}
              onClick={() => choose(opt)}
              className={`px-3 py-1.5 rounded-md border text-xs font-display font-medium transition-colors ${
                item.textValue === opt
                  ? 'border-primary-500/60 bg-primary-500/10 text-primary-600 dark:text-primary-400'
                  : 'border-border text-text-secondary hover:bg-surface-hover'
              } ${!interactive ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
