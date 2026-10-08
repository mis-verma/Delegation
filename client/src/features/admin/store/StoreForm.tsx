import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Hash, MapPin, Store as StoreIcon } from 'lucide-react';
import { Input, Button, Modal, InlineError } from '../../../components';
import { useCreateStoreMutation, useUpdateStoreMutation } from '../hook';
import { useStoresQuery } from '../../tickets/hook';
import { isDuplicateName } from '../orgCounts';
import { useDiscardGuard } from '../useDiscardGuard';
import { FormSection } from '../users/FormField';
import type { Store } from '../../../api/stores';

// Built per render of the form so the duplicate-name check can read the cached store list.
const buildStoreSchema = (existing: Store[] | undefined, ignoreId: string | undefined) =>
  z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Store name is required')
      .max(80, 'Keep the name under 80 characters')
      .superRefine((value, ctx) => {
        if (isDuplicateName(existing, value, ignoreId)) {
          ctx.addIssue({ code: 'custom', message: `A store called ${value} already exists` });
        }
      }),
    code: z.string().trim().toUpperCase().max(32, 'Keep the code under 32 characters'),
    address: z.string().trim().max(500, 'Keep the address under 500 characters'),
  });

type StoreFields = z.infer<ReturnType<typeof buildStoreSchema>>;

interface StoreFormProps {
  onClose: () => void;
  store?: Store;
  /** Called with the newly-created store right after a successful create (not fired when
   *  editing). Lets a caller opening this as a nested "quick create" (e.g. from UserForm's
   *  store Combobox) auto-select the result instead of the admin re-picking it themselves. */
  onCreated?: (store: Store) => void;
  /** Seeds the name field, e.g. whatever the admin had already typed into a Combobox's search
   *  box before hitting "Create new store". */
  prefillName?: string;
  /** True when this opens on top of another modal (the user form's quick add / edit). It then stays
   *  non-modal so the two dialogs do not fight over focus and scroll lock. On its own (from the
   *  Stores tab) it is a normal modal, exactly like the user form. */
  nested?: boolean;
}

export const StoreForm = ({ onClose, store, onCreated, prefillName, nested = false }: StoreFormProps) => {
  const isEditing = !!store;
  const createMutation = useCreateStoreMutation();
  const updateMutation = useUpdateStoreMutation();
  const mutation = isEditing ? updateMutation : createMutation;

  const { data: stores } = useStoresQuery();
  const schema = useMemo(() => buildStoreSchema(stores, store?.id), [stores, store?.id]);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<StoreFields>({
    resolver: zodResolver(schema),
    defaultValues: { name: store?.name || prefillName || '', code: store?.code || '', address: store?.address || '' },
  });

  const isPending = mutation.isPending;
  const requestClose = useDiscardGuard(isDirty, isPending, onClose);

  const onSubmit = (data: StoreFields) => {
    if (isEditing && store) {
      // An emptied code/address is sent as '' (the payload type and the server schema both reject
      // null); the server stores it as blank and every screen treats blank as "not set".
      updateMutation.mutate(
        { id: store.id, payload: { name: data.name, code: data.code, address: data.address } },
        { onSuccess: onClose }
      );
    } else {
      createMutation.mutate(
        { name: data.name, code: data.code || undefined, address: data.address || undefined },
        { onSuccess: (created) => { onCreated?.(created); onClose(); } }
      );
    }
  };

  const footer = (
    <>
      <Button type="button" variant="outline" size="sm" onClick={requestClose} disabled={isPending}>
        Cancel
      </Button>
      <Button type="submit" form="store-form" variant="primary" size="sm" isLoading={isPending}>
        {isEditing ? 'Save changes' : 'Create store'}
      </Button>
    </>
  );

  return (
    <Modal
      open
      onClose={requestClose}
      // Non-modal only when opened on top of another Modal (the user form's quick add / edit), same
      // reasoning as DatePicker/DateRangePicker. On its own it is a normal modal like the user form.
      modal={!nested}
      icon={<StoreIcon className="w-5 h-5" />}
      title={isEditing ? 'Edit store' : 'New store'}
      description={isEditing ? "Update this store's name, code and address." : 'Add a place where checklists run.'}
      footer={footer}
      showCloseButton={false}
      draggable
    >
      <form id="store-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <fieldset disabled={isPending} className="flex flex-col gap-5 disabled:opacity-60">
          <FormSection title="Basics" icon={StoreIcon} description="The name and code used across checklists.">
            <Input id="name" label="Store name" icon={StoreIcon} placeholder="e.g. Karol Bagh" autoFocus error={errors.name?.message} {...register('name')} />
            <Input id="code" label="Code (optional)" icon={Hash} placeholder="e.g. KB01" autoCapitalize="characters" error={errors.code?.message} {...register('code')} />
          </FormSection>
          <FormSection title="Location" icon={MapPin} description="Where the store is.">
            <Input id="address" label="Address (optional)" icon={MapPin} placeholder="e.g. 12 Main Market, Karol Bagh" error={errors.address?.message} {...register('address')} />
          </FormSection>
        </fieldset>

        {mutation.isError && (
          <InlineError
            message={mutation.error instanceof Error ? mutation.error.message : `Couldn't ${isEditing ? 'save this store' : 'create this store'}. Try again.`}
          />
        )}
      </form>
    </Modal>
  );
};
