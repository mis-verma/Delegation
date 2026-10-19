import { useState, type FormEvent } from 'react';
import { Shirt } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input, Button, Modal, InlineError } from '../../../components';
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
  dressType?: DressType;
  onCreated?: (dressType: DressType) => void;
  prefillName?: string;
  nested?: boolean;
}

const NAME_MAX = 80;

const CHIP_BASE =
  'inline-flex items-center gap-1.5 min-h-11 sm:min-h-8 px-3 rounded-full border text-xs font-display font-medium cursor-pointer ' +
  'transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40';

const GENDER_NOUN = { FEMALE: 'women', MALE: 'men' } as const;

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

  const holders = dressType?.peopleCount ?? 0;
  const genderWarning = dressType && gender && gender !== dressType.gender && holders > 0
    ? `${holders} ${holders === 1 ? 'person has' : 'people have'} this type now. Anyone who is not ${GENDER_NOUN[gender]} will need another type on the People page.`
    : undefined;

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

          <FormField label="Who wears it" hint="Women and Men types only show for people of that gender." warning={genderWarning}>
            <div role="radiogroup" aria-label="Who wears it" className="flex flex-wrap gap-2">
              {GENDER_OPTIONS.map((option, index) => {
                const checked = gender === option.value;
                return (
                  <button
                    key={option.label}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    tabIndex={checked ? 0 : -1}
                    onClick={() => setGender(option.value)}
                    onKeyDown={(e) => {
                      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
                      if (!step) return;
                      e.preventDefault();
                      const next = GENDER_OPTIONS[(index + step + GENDER_OPTIONS.length) % GENDER_OPTIONS.length];
                      setGender(next.value);
                      (e.currentTarget.parentElement?.children[GENDER_OPTIONS.indexOf(next)] as HTMLElement | undefined)?.focus();
                    }}
                    className={cn(
                      CHIP_BASE,
                      checked
                        ? 'border-primary-500/50 bg-primary-500/10 text-primary-700 dark:text-primary-300'
                        : 'border-border bg-surface text-text-secondary hover:border-border-hover hover:text-text',
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
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
