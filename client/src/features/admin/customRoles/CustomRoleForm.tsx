import { useMemo } from 'react';
import { useForm, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ShieldCheck, Tag } from 'lucide-react';
import { Input, Button, Modal, InlineError, Switch } from '../../../components';
import { useCreateCustomRoleMutation, useUpdateCustomRoleMutation, useCustomRolesQuery } from '../hook';
import { ROLE_META, ROLE_ORDER } from '../roleBadge';
import { useDiscardGuard } from '../useDiscardGuard';
import { FormField, FormPreview, FormSection } from '../users/FormField';
import { RoleChip } from '../../../components';
import type { CustomRole } from '../../../api/customRoles';
import type { Role } from '../../../api/admin';

const buildCustomRoleSchema = (existing: CustomRole[] | undefined, ignoreId: string | undefined) =>
  z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Role name is required')
      .max(80, 'Keep the name under 80 characters')
      .superRefine((value, ctx) => {
        const taken = (existing ?? []).some((r) => r.id !== ignoreId && r.name.toLowerCase() === value.toLowerCase());
        if (taken) ctx.addIssue({ code: 'custom', message: `A role called ${value} already exists` });
      }),
    baseRole: z.enum(ROLE_ORDER as [Role, ...Role[]]),
    description: z.string().trim().max(255),
    isActive: z.boolean(),
  });

type CustomRoleFields = z.infer<ReturnType<typeof buildCustomRoleSchema>>;

interface CustomRoleFormProps {
  onClose: () => void;
  customRole?: CustomRole;
}

export const CustomRoleForm = ({ onClose, customRole }: CustomRoleFormProps) => {
  const isEditing = !!customRole;
  const createMutation = useCreateCustomRoleMutation();
  const updateMutation = useUpdateCustomRoleMutation();
  const mutation = isEditing ? updateMutation : createMutation;

  const { data: existing } = useCustomRolesQuery();
  const schema = useMemo(() => buildCustomRoleSchema(existing, customRole?.id), [existing, customRole?.id]);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isDirty },
  } = useForm<CustomRoleFields>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: customRole?.name ?? '',
      baseRole: customRole?.baseRole ?? 'USER',
      description: customRole?.description ?? '',
      isActive: customRole?.isActive ?? true,
    },
  });

  const [nameValue, baseRoleValue] = useWatch({ control, name: ['name', 'baseRole'] });
  const isPending = mutation.isPending;
  const requestClose = useDiscardGuard(isDirty, isPending, onClose);

  const onSubmit = (data: CustomRoleFields) => {
    const payload = { name: data.name, baseRole: data.baseRole, description: data.description || undefined, isActive: data.isActive };
    if (isEditing && customRole) {
      updateMutation.mutate({ id: customRole.id, payload }, { onSuccess: onClose });
    } else {
      createMutation.mutate(payload, { onSuccess: onClose });
    }
  };

  const footer = (
    <>
      <Button type="button" variant="outline" size="sm" onClick={requestClose} disabled={isPending}>
        Cancel
      </Button>
      <Button type="submit" form="custom-role-form" variant="primary" size="sm" isLoading={isPending}>
        {isEditing ? 'Save changes' : 'Create role'}
      </Button>
    </>
  );

  return (
    <Modal
      open
      onClose={requestClose}
      icon={<Tag className="w-5 h-5" />}
      title={isEditing ? 'Edit role' : 'New role'}
      description={isEditing ? "Update this role's name and permissions." : 'Give it a name, then pick which existing role it behaves like.'}
      footer={footer}
      showCloseButton={false}
      draggable
    >
      <form id="custom-role-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <fieldset disabled={isPending} className="flex flex-col gap-4 sm:gap-5 disabled:opacity-60">
          <FormPreview
            lead={<RoleChip role={baseRoleValue} label={nameValue?.trim() || 'New role'} />}
            title={nameValue?.trim() || 'New role'}
            subtitle={`Acts as ${ROLE_META[baseRoleValue].label}`}
          />

          <FormSection title="Basics" icon={Tag} description="What this role is called.">
            <Input id="name" label="Role name" icon={Tag} placeholder="e.g. Billing Executive" autoFocus error={errors.name?.message} {...register('name')} />
            <Input id="description" label="Description (optional)" placeholder="What they do" error={errors.description?.message} {...register('description')} />
          </FormSection>

          <FormSection title="Permissions" icon={ShieldCheck} description="Pick the existing role whose access this one copies. You can't fine-tune individual permissions yet, only pick which role it mirrors.">
            <FormField label="Behaves like" icon={ShieldCheck} hint={ROLE_META[baseRoleValue].description}>
              <Controller
                control={control}
                name="baseRole"
                render={({ field }) => (
                  <div className="@container">
                    <div role="radiogroup" aria-label="Behaves like" className="grid grid-cols-2 gap-2 @[36rem]:grid-cols-4">
                      {ROLE_ORDER.map((r) => (
                        <button
                          key={r}
                          type="button"
                          role="radio"
                          aria-checked={field.value === r}
                          onClick={() => field.onChange(r)}
                          className="flex items-center gap-2 min-h-11 sm:min-h-10 px-2.5 rounded-xl border text-left transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 data-[on=true]:border-primary-500 data-[on=true]:bg-primary-500/8 dark:data-[on=true]:bg-primary-500/15 border-border bg-surface hover:border-primary-300"
                          data-on={field.value === r}
                        >
                          <span className="min-w-0 flex-1 t-meta font-display font-semibold">{ROLE_META[r].label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              />
            </FormField>

            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <label
                  htmlFor="isActive"
                  className="flex items-start gap-3 min-h-11 px-3 py-2.5 rounded-xl border border-border bg-surface hover:border-border-hover cursor-pointer transition-colors duration-150"
                >
                  <Switch id="isActive" checked={field.value} onChange={field.onChange} className="mt-0.5" />
                  <span className="flex flex-col gap-0.5 min-w-0">
                    <span className="t-card font-display font-semibold text-text">Active</span>
                    <span className="t-meta font-display text-text-muted">Turn off to hide it from the role picker. People already on it keep it.</span>
                  </span>
                </label>
              )}
            />
          </FormSection>
        </fieldset>

        {mutation.isError && (
          <InlineError message={mutation.error instanceof Error ? mutation.error.message : `Couldn't ${isEditing ? 'save' : 'create'} this role. Try again.`} />
        )}
      </form>
    </Modal>
  );
};
