import { memo, useMemo } from 'react';
import { useSetChecklistInstanceItemDoneMutation } from '../hook';
import { SelectDropdown, ToggleChip, type SelectDropdownOption } from '../../../components';
import { ChecklistItemCardHeader } from './ChecklistItemCardHeader';
import { ItemCardShell } from './ItemCardShell';
import { ItemError } from './ItemError';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

interface ChecklistInstanceItemChoiceCardProps {
  item:       ChecklistInstanceItem;
  instanceId: string;
  canWork:    boolean;
  isLocked:   boolean;
}

// Shared by MULTIPLE_CHOICE and DROPDOWN — same options list and textValue field, only the
// picker widget differs (chip buttons vs the shared dropdown), matching how the two read in the
// reference design (a chip row reads better inline than a dropdown once there are only a
// handful of options, but DROPDOWN keeps the compact control it's named for).
export const ChecklistInstanceItemChoiceCard = memo(function ChecklistInstanceItemChoiceCard({ item, instanceId, canWork, isLocked }: ChecklistInstanceItemChoiceCardProps) {
  const setItemDone = useSetChecklistInstanceItemDoneMutation(instanceId);
  const interactive = canWork && !isLocked;
  // A saved answer used to stay clickable and silently overwrite itself (even while waiting for
  // approval). Changing it now goes through Reopen, like every other item type.
  const editable = interactive && !item.isDone;
  const options = useMemo(() => item.options ?? [], [item.options]);
  const textValue = item.textValue ?? '';

  // The dropdown has no native "Select an option" row, so an unanswered one gets a placeholder entry
  // that choose() ignores. An answer that is no longer in the list still shows rather than blanking.
  const dropdownOptions = useMemo<SelectDropdownOption<string>[]>(() => {
    const list = options.map((opt) => ({ value: opt, label: opt }));
    if (!textValue) return [{ value: '', label: 'Select an option' }, ...list];
    return options.includes(textValue) ? list : [{ value: textValue, label: textValue }, ...list];
  }, [options, textValue]);

  const choose = (value: string) => {
    if (!editable || setItemDone.isPending || !value) return;
    setItemDone.mutate({ itemId: item.id, isDone: true, textValue: value });
  };

  return (
    <ItemCardShell isLocked={isLocked}>
      <ChecklistItemCardHeader
        item={item}
        interactive={interactive}
        reopenPending={setItemDone.isPending}
        onReopen={() => setItemDone.mutate({ itemId: item.id, isDone: false, textValue: item.textValue ?? undefined })}
      />

      <ItemError error={setItemDone.error} fallback="Couldn't save that answer." />

      {item.itemType === 'DROPDOWN' ? (
        <SelectDropdown
          value={textValue}
          onChange={choose}
          options={dropdownOptions}
          disabled={!editable}
          aria-label={item.label}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <ToggleChip
              key={opt}
              on={item.textValue === opt}
              disabled={!editable}
              onClick={() => choose(opt)}
              className="rounded-lg"
            >
              {opt}
            </ToggleChip>
          ))}
        </div>
      )}
    </ItemCardShell>
  );
});
