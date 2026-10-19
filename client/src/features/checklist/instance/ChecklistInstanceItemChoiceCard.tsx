import { memo, useMemo } from 'react';
import { haptic } from '../../../lib/haptics';
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

export const ChecklistInstanceItemChoiceCard = memo(function ChecklistInstanceItemChoiceCard({ item, instanceId, canWork, isLocked }: ChecklistInstanceItemChoiceCardProps) {
  const setItemDone = useSetChecklistInstanceItemDoneMutation(instanceId);
  const interactive = canWork && !isLocked;
  const editable = interactive && !item.isDone;
  const options = useMemo(() => item.options ?? [], [item.options]);
  const textValue = item.isDone ? item.textValue ?? '' : '';
  const previousAnswer = !item.isDone && item.textValue ? item.textValue : null;

  const dropdownOptions = useMemo<SelectDropdownOption<string>[]>(() => {
    const list = options.map((opt) => ({ value: opt, label: opt }));
    if (!textValue) return [{ value: '', label: 'Select an option' }, ...list];
    return options.includes(textValue) ? list : [{ value: textValue, label: textValue }, ...list];
  }, [options, textValue]);

  const choose = (value: string) => {
    if (!editable || setItemDone.isPending || !value) return;
    haptic('tap');
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

      {previousAnswer && interactive && (
        <p className="t-meta text-text-muted">Reopened. It was answered "{previousAnswer}" before. Answer it again.</p>
      )}

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
              on={item.isDone && item.textValue === opt}
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
