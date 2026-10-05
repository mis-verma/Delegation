import { useState, type FormEvent } from 'react';
import { Shirt } from 'lucide-react';
import { Input, Button, Modal, InlineError, ToggleChip } from '../../../components';
import { useCreateDressTypeMutation, useDressTypesQuery, useUpdateDressTypeMutation } from './hook';
import { isDuplicateName } from '../orgCounts';
import { useDiscardGuard } from '../useDiscardGuard';
import { FormField } from '../users/FormField';
import type { DressType, DressTypeGender } from '../../../api/dressTypes';

const GENDER_OPTIONS: { value: DressTypeGender | null; label: string }[] = [
  { value: null, label: 'Anyone' },
  { value: 'FEMALE', label: 'Women' },
  { value: 'MALE', label: 'Men' },
];

interface DressTypeFormDialogProps {
  onClose: () => void;
  /** Set to edit an existing type; leave out to create one. */
  dressType?: DressType;
  /** Called with the new type right after a successful create (not when editing), so a caller can
   *  select or add it straight away. */
  onCreated?: (dressType: DressType) => void;
  /** Seeds the name, e.g. what was typed into a Combobox before "Create new type". */
  prefillName?: string;
  /** True when this opens on top of another modal. It then stays non-modal so the two dialogs do
   *  not fight over focus and scroll lock, same as DepartmentForm and StoreForm. */
  nested?: boolean;
}

const NAME_MAX = 60;

/** Small dialog to add or rename a dress type and say who it is for. */
export const DressTypeFormDialog = ({ onClose, dressType, onCreated, prefillName, nested = false }: DressTypeFormDialogProps) => {
  const isEditing = !!dressType;
  const { data: types } = useDressTypesQuery();
  const createMutation = useCreateDressTypeMutation();
  const updateMutation = useUpdateDressTypeMutation();
  const mutation = isEditing ? updateMutation : createMutation;
  const isPending = mutation.isPending;

  const [name, setName] = useState(dressType?.name ?? prefillName ?? '');
  const [gender, setGender] = useState<DressTypeGender | null>(dressType?.gender ?? null);
  const [touched, setTouched] = useState(false);

  const trimmed = name.trim();
  const isDirty = trimmed !== (dressType?.name ?? prefillName ?? '').trim() || gender !== (dressType?.gender ?? null);
  const requestClose = useDiscardGuard(isDirty, isPending, onClose);

  const nameError = !touched
    ? undefined
    : !trimmed
      ? 'Give this type a name'
      : trimmed.length > NAME_MAX
        ? `Keep the name under ${NAME_MAX} characters`
        : isDuplicateName(types, trimmed, dressType?.id)
          ? `A type called ${trimmed} already exists`
          : undefined;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!trimmed || trimmed.length > NAME_MAX || isDuplicateName(types, trimmed, dressType?.id)) return;

    if (dressType) {
      const payload: { name?: string; gender?: DressTypeGender | null } = {};
      if (trimmed !== dressType.name) payload.name = trimmed;
      if (gender !== dressType.gender) payload.gender = gender;
      if (Object.keys(payload).length === 0) {
        onClose();
        return;
      }
      updateMutation.mutate({ id: dressType.id, payload }, { onSuccess: onClose });
      return;
    }
    createMutation.mutate(
      { name: trimmed, gender },
      { onSuccess: (created) => { onCreated?.(created); onClose(); } },
    );
  };

  const formId = 'dress-type-form';
  const footer = (
    <>
      <Button type="button" variant="outline" size="sm" onClick={requestClose} disabled={isPending}>
        Cancel
      </Button>
      <Button type="submit" form={formId} variant="primary" size="sm" isLoading={isPending}>
        {isEditing ? 'Save changes' : 'Add type'}
      </Button>
    </>
  );

  return (
    <Modal
      open
      onClose={requestClose}
      modal={!nested}
      icon={<Shirt className="w-5 h-5" />}
      title={isEditing ? 'Edit dress type' : 'New dress type'}
      description="A dress type has its own list of things to check in an audit."
      size="sm"
      footer={footer}
      showCloseButton={false}
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <fieldset disabled={isPending} className="flex flex-col gap-4 disabled:opacity-60">
          <Input
            id="dress-type-name"
            label="Type name"
            icon={Shirt}
            placeholder="e.g. Saree"
            autoFocus
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched(true)}
            error={nameError}
          />

          <FormField label="Who wears it" hint="Women and Men types only show for people of that gender.">
            <div role="radiogroup" aria-label="Who wears it" className="flex flex-wrap gap-2">
              {GENDER_OPTIONS.map((option) => (
                <ToggleChip
                  key={option.label}
                  on={gender === option.value}
                  onClick={() => setGender(option.value)}
                >
                  {option.label}
                </ToggleChip>
              ))}
            </div>
          </FormField>
        </fieldset>

        {mutation.isError && (
          <InlineError
            message={mutation.error instanceof Error ? mutation.error.message : `Couldn't ${isEditing ? 'save this type' : 'add this type'}. Try again.`}
          />
        )}
      </form>
    </Modal>
  );
};
