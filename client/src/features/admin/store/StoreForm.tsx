import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, ExternalLink, Hash, MapPin, Store as StoreIcon, Users } from 'lucide-react';
import { Input, Button, Modal, InlineError, EntityIconTile } from '../../../components';
import { useCreateStoreMutation, useUpdateStoreMutation, useUsersQuery } from '../hook';
import { useDepartmentsQuery, useStoresQuery } from '../../tickets/hook';
import { isDuplicateName } from '../orgCounts';
import { useDiscardGuard } from '../useDiscardGuard';
import { FormPreview, FormSection } from '../users/FormField';
import { CardChip } from '../directory/orgScores';
import type { Store } from '../../../api/stores';

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

const suggestCode = (name: string, taken: Set<string>) => {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(' ').filter(Boolean);
  if (words.length === 0) return '';
  const stem = words.length > 1 ? words.slice(0, 3).map((w) => w[0]).join('') : words[0].slice(0, 2);
  for (let n = 1; n < 100; n++) {
    const code = `${stem}${String(n).padStart(2, '0')}`;
    if (!taken.has(code)) return code;
  }
  return stem;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface StoreFormProps {
  onClose: () => void;
  store?: Store;
  onCreated?: (store: Store) => void;
  prefillName?: string;
  nested?: boolean;
}

export const StoreForm = ({ onClose, store, onCreated, prefillName, nested = false }: StoreFormProps) => {
  const isEditing = !!store;
  const createMutation = useCreateStoreMutation();
  const updateMutation = useUpdateStoreMutation();
  const mutation = isEditing ? updateMutation : createMutation;

  const { data: stores } = useStoresQuery();
  const { data: departments } = useDepartmentsQuery();
  const { data: users } = useUsersQuery();
  const schema = useMemo(() => buildStoreSchema(stores, store?.id), [stores, store?.id]);
  const takenCodes = useMemo(
    () => new Set((stores ?? []).filter((s) => s.id !== store?.id && s.code).map((s) => (s.code ?? '').toUpperCase())),
    [stores, store?.id],
  );

  const initialCode = store?.code || (prefillName ? suggestCode(prefillName, new Set()) : '');
  const [suggestedCode, setSuggestedCode] = useState<string | null>(isEditing ? null : initialCode);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { errors, isDirty },
  } = useForm<StoreFields>({
    resolver: zodResolver(schema),
    defaultValues: { name: store?.name || prefillName || '', code: initialCode, address: store?.address || '' },
  });

  const [nameValue, codeValue, addressValue] = useWatch({ control, name: ['name', 'code', 'address'] });
  const codeIsSuggested = !isEditing && !!codeValue && codeValue === suggestedCode;

  const isPending = mutation.isPending;
  const requestClose = useDiscardGuard(isDirty, isPending, onClose);

  const departmentCount = store ? (departments ?? []).filter((d) => d.storeId === store.id).length : 0;
  const peopleCount = store ? (users ?? []).filter((u) => u.isActive && u.storeId === store.id).length : 0;
  const address = addressValue?.trim();

  const nameField = register('name', {
    onChange: (e: { target: { value: string } }) => {
      if (isEditing) return;
      const current = getValues('code');
      if (current && current !== suggestedCode) return;
      const next = suggestCode(e.target.value, takenCodes);
      setSuggestedCode(next);
      setValue('code', next, { shouldDirty: true });
    },
  });

  const onSubmit = (data: StoreFields) => {
    if (isEditing && store) {
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
      modal={!nested}
      icon={<StoreIcon className="w-5 h-5" />}
      title={isEditing ? 'Edit store' : 'New store'}
      description={isEditing ? "Update this store's name, code and address." : 'Add a place where checklists run.'}
      footer={footer}
      showCloseButton={false}
      draggable
    >
      <form id="store-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <fieldset disabled={isPending} className="flex flex-col gap-4 sm:gap-5 disabled:opacity-60">
          <FormPreview
            lead={<EntityIconTile icon={StoreIcon} tone="coral" className="group-hover:scale-100" />}
            title={nameValue?.trim() || 'New store'}
            subtitle={address || 'No address yet'}
            chips={
              (codeValue?.trim() || isEditing) && (
                <>
                  {codeValue?.trim() && <CardChip icon={Hash} tone="coral" label={codeValue.trim().toUpperCase()} />}
                  {isEditing && <CardChip icon={Building2} label={plural(departmentCount, 'department', 'departments')} />}
                  {isEditing && <CardChip icon={Users} label={plural(peopleCount, 'person', 'people')} />}
                </>
              )
            }
          />

          <FormSection title="Basics" icon={StoreIcon} tone="coral" description="The name and code used across checklists.">
            <Input id="name" label="Store name" icon={StoreIcon} placeholder="e.g. Karol Bagh" autoFocus error={errors.name?.message} {...nameField} />
            <div className="flex flex-col gap-1">
              <Input id="code" label="Code (optional)" icon={Hash} placeholder="e.g. KB01" autoCapitalize="characters" className="" error={errors.code?.message} {...register('code')} />
              {codeIsSuggested && <p className="px-1 t-meta font-display text-text-muted">Filled in from the name. Type over it to use your own.</p>}
            </div>
          </FormSection>

          <FormSection title="Location" icon={MapPin} tone="coral" description="Where the store is.">
            <div className="flex flex-col gap-1.5">
              <Input id="address" label="Address (optional)" icon={MapPin} placeholder="e.g. 12 Main Market, Karol Bagh" error={errors.address?.message} {...register('address')} />
              {address && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-fit items-center gap-1.5 min-h-9 px-1 t-meta font-display font-semibold text-primary-600 dark:text-primary-400 hover:underline outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded-md"
                >
                  <ExternalLink className="size-3.5" aria-hidden />
                  Check it on Google Maps
                </a>
              )}
            </div>
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
