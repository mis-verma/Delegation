import { useMemo } from 'react';
import { useForm, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, MapPin, ShieldCheck, Store, UserCog, UserX, Users } from 'lucide-react';
import { Input, Button, Modal, Combobox, InlineError, Skeleton, Switch, EntityIconTile } from '../../../components';
import { useCreateDepartmentMutation, useUpdateDepartmentMutation, useUsersQuery } from '../hook';
import { useDepartmentsQuery, useStoresQuery } from '../../tickets/hook';
import { isDuplicateName } from '../orgCounts';
import { ROLE_LABEL } from '../roleBadge';
import { useDiscardGuard } from '../useDiscardGuard';
import { FormField, FormPreview, FormSection } from '../users/FormField';
import { CardChip } from '../directory/orgScores';
import type { Department } from '../../../api/departments';
import type { AdminUser } from '../../../api/admin';

// Built per render of the form so the duplicate-name check can read the cached department list.
const buildDepartmentSchema = (existing: Department[] | undefined, ignoreId: string | undefined) =>
  z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Department name is required')
      .max(80, 'Keep the name under 80 characters')
      .superRefine((value, ctx) => {
        if (isDuplicateName(existing, value, ignoreId)) {
          ctx.addIssue({ code: 'custom', message: `A department called ${value} already exists` });
        }
      }),
    storeId: z.string().optional(),
    headOptional: z.boolean(),
  });

type DepartmentFields = z.infer<ReturnType<typeof buildDepartmentSchema>>;

interface DepartmentFormProps {
  onClose: () => void;
  department?: Department;
  /** Called with the newly-created department right after a successful create (not fired when
   *  editing). Lets a caller opening this as a nested "quick create" (e.g. from UserForm's
   *  department Combobox) auto-select the result instead of the admin re-picking it themselves. */
  onCreated?: (department: Department) => void;
  /** Seeds the name field, e.g. whatever the admin had already typed into a Combobox's search
   *  box before hitting "Create new department". */
  prefillName?: string;
  /** True when this opens on top of another modal (the user form's quick add / edit). It then stays
   *  non-modal so the two dialogs do not fight over focus and scroll lock. On its own (from the
   *  Departments tab) it is a normal modal, exactly like the user form. */
  nested?: boolean;
}

// Read-only: who currently leads this department. Changing a head means changing that person's
// role or department on the People page, so this only shows the answer and flags a gap.
const DepartmentHeads = ({ heads, isPending, headOptional }: { heads: AdminUser[]; isPending: boolean; headOptional: boolean }) => (
  <FormField label="Department head" icon={UserCog}>
    {isPending ? (
      <Skeleton className="h-7 w-40 rounded-full" />
    ) : heads.length === 0 && headOptional ? (
      <span className="px-1 t-meta font-display text-text-muted">No head, and that is fine for this department.</span>
    ) : heads.length === 0 ? (
      <div className="flex flex-wrap items-center gap-2">
        <CardChip icon={UserX} tone="warning" label="No head yet" />
        <span className="t-meta font-display text-text-muted">Give a Manager or Senior this department on the People page.</span>
      </div>
    ) : (
      <ul className="flex flex-wrap gap-1.5">
        {heads.map(h => (
          <li key={h.id} className="contents">
            <CardChip icon={UserCog} tone="primary" label={`${h.firstName} ${h.lastName ?? ''}`.trim() + ` · ${ROLE_LABEL[h.role]}`} />
          </li>
        ))}
      </ul>
    )}
  </FormField>
);

export const DepartmentForm = ({ onClose, department, onCreated, prefillName, nested = false }: DepartmentFormProps) => {
  const isEditing = !!department;
  const createMutation = useCreateDepartmentMutation();
  const updateMutation = useUpdateDepartmentMutation();
  const mutation = isEditing ? updateMutation : createMutation;

  const { data: stores, isPending: isStoresLoading } = useStoresQuery();
  const { data: departments } = useDepartmentsQuery();
  const schema = useMemo(() => buildDepartmentSchema(departments, department?.id), [departments, department?.id]);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isDirty },
  } = useForm<DepartmentFields>({
    resolver: zodResolver(schema),
    defaultValues: { name: department?.name || prefillName || '', storeId: department?.storeId ?? '', headOptional: department?.headOptional ?? false }
  });

  const [headOptional, nameValue, storeIdValue] = useWatch({ control, name: ['headOptional', 'name', 'storeId'] });
  const { data: users, isPending: isUsersLoading } = useUsersQuery();
  const members = useMemo(() => (department ? (users ?? []).filter((u) => u.isActive && u.departmentId === department.id) : []), [users, department]);
  const heads = useMemo(() => members.filter((u) => u.role === 'MANAGER' || u.role === 'SENIOR'), [members]);
  const storeName = stores?.find((st) => st.id === storeIdValue)?.name;
  const isPending = mutation.isPending;
  const requestClose = useDiscardGuard(isDirty, isPending, onClose);

  const onSubmit = (data: DepartmentFields) => {
    const storePayload = data.storeId || undefined;

    if (isEditing && department) {
      updateMutation.mutate(
        { id: department.id, payload: { name: data.name, storeId: storePayload ?? null, headOptional: data.headOptional } },
        { onSuccess: onClose }
      );
    } else {
      createMutation.mutate(
        { name: data.name, storeId: storePayload, headOptional: data.headOptional },
        { onSuccess: (created) => { onCreated?.(created); onClose(); } }
      );
    }
  };

  const footer = (
    <>
      <Button type="button" variant="outline" size="sm" onClick={requestClose} disabled={isPending}>
        Cancel
      </Button>
      <Button type="submit" form="department-form" variant="primary" size="sm" isLoading={isPending}>
        {isEditing ? 'Save changes' : 'Create department'}
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
      icon={<Building2 className="w-5 h-5" />}
      title={isEditing ? 'Edit department' : 'New department'}
      description={
        isEditing
          ? "Update this department's name and store."
          : 'Departments group your people and decide who sees which checklists.'
      }
      footer={footer}
      showCloseButton={false}
      draggable
    >
      <form id="department-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <fieldset disabled={isPending} className="flex flex-col gap-4 sm:gap-5 disabled:opacity-60">
          <FormPreview
            lead={<EntityIconTile icon={Building2} className="group-hover:scale-100" />}
            title={nameValue?.trim() || 'New department'}
            subtitle={storeName ? `Works from ${storeName}` : 'No store picked yet'}
            chips={
              (isEditing || headOptional) && (
                <>
                  {isEditing && <CardChip icon={Users} label={`${members.length} ${members.length === 1 ? 'person' : 'people'}`} />}
                  {headOptional ? (
                    <CardChip icon={ShieldCheck} tone="success" label="No head needed" />
                  ) : (
                    isEditing && !isUsersLoading && heads.length === 0 && <CardChip icon={UserX} tone="warning" label="No head yet" />
                  )}
                </>
              )
            }
          />

          <FormSection title="Basics" icon={Building2} description="What this team is called.">
            <Input
              id="name"
              label="Department name"
              icon={Building2}
              placeholder="e.g. Customer Support"
              autoFocus
              error={errors.name?.message}
              {...register('name')}
            />
          </FormSection>

          <FormSection title="Placement" icon={MapPin} description="Which store it works from, and who leads it.">
            <FormField htmlFor="storeId" label="Store (optional)" icon={Store} hint="Pick the store this department works from.">
              <Controller
                control={control}
                name="storeId"
                render={({ field }) => (
                  <Combobox
                    id="storeId"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    isLoading={isStoresLoading}
                    placeholder="Search stores..."
                    emptyOptionLabel="No store"
                    options={(stores ?? []).map((s) => ({ value: s.id, label: s.name }))}
                  />
                )}
              />
            </FormField>

            {isEditing && <DepartmentHeads heads={heads} isPending={isUsersLoading} headOptional={headOptional} />}

            <Controller
              control={control}
              name="headOptional"
              render={({ field }) => (
                <label
                  htmlFor="headOptional"
                  className="flex items-start gap-3 min-h-11 px-3 py-2.5 rounded-xl border border-border bg-surface hover:border-border-hover cursor-pointer transition-colors duration-150"
                >
                  <Switch id="headOptional" checked={field.value} onChange={field.onChange} className="mt-0.5" />
                  <span className="flex flex-col gap-0.5 min-w-0">
                    <span className="t-card font-display font-semibold text-text">This department does not need a head</span>
                    <span className="t-meta font-display text-text-muted">
                      Turn this on when Admin or PC approve its work, so it stays out of the "no head" warning.
                    </span>
                  </span>
                </label>
              )}
            />
          </FormSection>
        </fieldset>

        {mutation.isError && (
          <InlineError
            message={mutation.error instanceof Error ? mutation.error.message : `Couldn't ${isEditing ? 'save this department' : 'create this department'}. Try again.`}
          />
        )}
      </form>
    </Modal>
  );
};
