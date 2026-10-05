import { useMemo, useRef, useState } from 'react';
import { useForm, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserPlus, ShieldCheck, Building2, Store, KeyRound, User, Mail, Phone, CalendarOff, Copy, Wand2, Pencil } from 'lucide-react';
import { Input, Button, Modal, Combobox, AvatarUpload, WeekdayPicker, InlineError, useConfirm } from '../../../components';
import {
  useCreateUserMutation,
  useUpdateUserMutation,
  useDepartmentsQuery,
  useUploadUserAvatarMutation,
  useRemoveUserAvatarMutation,
} from '../hook';
import { useStoresQuery } from '../../tickets/hook';
import { resolveAvatarUrl } from '../../../lib/uploadsBase';
import { ApiError } from '../../../api/http';
import { DepartmentForm } from '../department/DepartmentForm';
import { StoreForm } from '../store/StoreForm';
import type { AdminUser, Role, UpdateUserPayload } from '../../../api/admin';
import { ROLE_META, ROLE_ORDER, isDepartmentHead } from '../roleBadge';
import { FormField, FormSection } from './FormField';
import { PasswordSharedPanel, PasswordVisibilityToggle, ResetPasswordSection } from './PasswordPanels';
import { MIN_PASSWORD_LENGTH, copyText, generatePassword } from './passwordTools';
import { fullName } from './userDisplay';

const ROLE_OPTIONS = ROLE_ORDER.map((value) => ({ value, label: ROLE_META[value].label }));

const buildUserSchema = (isEditing: boolean) =>
  z
    .object({
      firstName: z.string().trim().min(1, 'First name is required'),
      lastName: z.string().trim().optional(),
      email: z.string().trim().toLowerCase().email('Enter a valid email address'),
      phone: z
        .string()
        .trim()
        .refine((v) => !v || /^[+\d\s\-()]{6,20}$/.test(v), 'Enter a valid phone number')
        .optional(),
      password: z.string().optional(),
      role: z.enum(['ADMIN', 'APPROVAL_MANAGER', 'SENIOR', 'MANAGER', 'AGENT', 'USER', 'PC'] as const),
      departmentId: z.string().optional(),
      storeId: z.string().optional(),
      // Picks which uniform list an audit checks this person against. '' = not set: they get the
      // question's main list.
      gender: z.enum(['', 'FEMALE', 'MALE']),
      // Weekly day(s) off: no daily checklists for this person on these days.
      weekOffDays: z.array(z.number()).max(6, 'Leave at least one working day'),
    })
    .superRefine((data, ctx) => {
      if (!isEditing && (!data.password || data.password.length < MIN_PASSWORD_LENGTH)) {
        ctx.addIssue({
          code: 'custom',
          path: ['password'],
          message: `Use at least ${MIN_PASSWORD_LENGTH} characters`,
        });
      }
    });

type UserFields = z.infer<ReturnType<typeof buildUserSchema>>;

interface UserFormProps {
  onClose: () => void;
  user?: AdminUser;
  /** Called with the newly-created user right after a successful create (not fired when editing). */
  onCreated?: (user: AdminUser) => void;
  /** Seeds fields on a fresh create (e.g. a name, and department if it was also mentioned, typed in
   *  Smart Add that didn't match anyone) without treating this as an edit: `user` above is what
   *  triggers edit mode. */
  prefill?: { firstName?: string; lastName?: string; departmentId?: string };
}

const isDuplicateEmail = (err: unknown) =>
  err instanceof ApiError ? err.status === 409 : err instanceof Error && /already/i.test(err.message);

// Small pencil beside a picked department or store: opens that record's own edit form on top of this
// one, so a wrong name or store can be fixed without closing the person's form.
const EditPickedButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    aria-label={label}
    className="flex items-center justify-center size-11 sm:size-10 shrink-0 rounded-xl border border-border bg-surface text-text-muted hover:text-text hover:border-primary-400/60 transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
  >
    <Pencil size={15} aria-hidden />
  </button>
);

export const UserForm = ({ onClose, user, onCreated, prefill }: UserFormProps) => {
  const isEditing = Boolean(user);
  const confirm = useConfirm();
  // Tracked locally (seeded from `user`, then updated straight from each mutation's response)
  // rather than re-read from `user` on every render: `user` is a snapshot captured when this
  // modal was opened, so it won't reflect a photo change made a moment ago in this same session.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Set after a successful create: swaps the form for a one-time "share this password" panel.
  const [created, setCreated] = useState<{ user: AdminUser; password: string } | null>(null);

  const createMutation = useCreateUserMutation();
  const updateMutation = useUpdateUserMutation();
  const mutation = isEditing ? updateMutation : createMutation;
  const uploadAvatarMutation = useUploadUserAvatarMutation();
  const removeAvatarMutation = useRemoveUserAvatarMutation();

  const { data: departments, isPending: isDepartmentsLoading } = useDepartmentsQuery();
  const { data: stores, isPending: isStoresLoading } = useStoresQuery();

  const schema = useMemo(() => buildUserSchema(isEditing), [isEditing]);

  // Quick-add: "Create new department/store" from inside the Combobox below opens the real
  // Department/Store form nested on top of this one, then feeds the freshly-created id straight
  // back into this form's field instead of making the admin close this modal, go create it
  // elsewhere, and reopen.
  const [creatingDepartment, setCreatingDepartment] = useState<string | null>(null);
  const [creatingStore, setCreatingStore] = useState<string | null>(null);
  // The department / store already picked above, opened for editing without leaving this form.
  const [editingDepartmentId, setEditingDepartmentId] = useState<string | null>(null);
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    setError,
    setFocus,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UserFields>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: user?.firstName ?? prefill?.firstName ?? '',
      lastName: user?.lastName ?? prefill?.lastName ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      role: user?.role ?? 'USER',
      departmentId: user?.departmentId ?? prefill?.departmentId ?? '',
      storeId: user?.storeId ?? '',
      gender: user?.gender ?? '',
      weekOffDays: user?.weekOffDays ? [...user.weekOffDays] : [],
      password: '',
    },
  });

  const [role, departmentId, storeId, passwordValue] = useWatch({ control, name: ['role', 'departmentId', 'storeId', 'password'] });
  const isPending = mutation.isPending || isSubmitting;

  // Closing from any route (X, Esc, overlay, Cancel) goes through here, so unsaved edits are never
  // lost to a stray click. Nothing to lose once the account exists and only the password panel shows.
  const requestClose = async () => {
    if (isPending) return;
    if (isDirty && !created) {
      const discard = await confirm({
        title: 'Discard changes?',
        description: 'You have changes that are not saved. If you close now, they will be lost.',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        variant: 'danger',
      });
      if (!discard) return;
    }
    onClose();
  };

  // Picking a department fills in its store, but only while the store is empty or still holds the
  // value filled in last time, so a store chosen on purpose is never overwritten.
  const autoFilledStore = useRef<string | null>(null);
  const handleDepartmentChange = (id: string, apply: (value: string) => void) => {
    apply(id);
    const dept = departments?.find((d) => d.id === id);
    if (!dept?.storeId) return;
    const current = getValues('storeId');
    if (!current || current === autoFilledStore.current) {
      setValue('storeId', dept.storeId, { shouldDirty: true });
      autoFilledStore.current = dept.storeId;
    }
  };

  const onSubmit = (data: UserFields) => {
    setSubmitError(null);
    const departmentPayload = data.departmentId || undefined;
    const storePayload = data.storeId || undefined;
    const phone = data.phone?.trim() || undefined;

    if (isEditing && user) {
      // Send only what actually changed. The form used to resend everything, so an old phone number
      // that no longer passes today's rules (or any other untouched field) made a plain role change
      // fail with a 400 the person could not explain.
      const payload: UpdateUserPayload = {};
      if (data.firstName !== user.firstName) payload.firstName = data.firstName;
      if ((data.lastName ?? '') !== (user.lastName ?? '')) payload.lastName = data.lastName ?? '';
      if (data.email.trim().toLowerCase() !== user.email.toLowerCase()) payload.email = data.email;
      if ((phone ?? null) !== ((user.phone?.trim() || null))) payload.phone = phone ?? null;
      if (data.role !== user.role) payload.role = data.role;
      if ((departmentPayload ?? null) !== (user.departmentId ?? null)) payload.departmentId = departmentPayload ?? null;
      if ((storePayload ?? null) !== (user.storeId ?? null)) payload.storeId = storePayload ?? null;
      if ((data.gender || null) !== (user.gender ?? null)) payload.gender = data.gender || null;
      if (JSON.stringify([...data.weekOffDays].sort()) !== JSON.stringify([...(user.weekOffDays ?? [])].sort())) payload.weekOffDays = data.weekOffDays;

      if (Object.keys(payload).length === 0) {
        onClose();
        return;
      }
      updateMutation.mutate({ id: user.id, payload }, { onSuccess: onClose, onError: handleSaveError });
      return;
    }

    // The zod schema's superRefine (above) already blocks submission without a valid password
    // when creating. This guard makes that guarantee visible to the type checker too, instead
    // of asserting past it, so a future edit that loosens the schema fails loudly here rather
    // than silently sending an undefined password to the API.
    if (!data.password) return;
    const password = data.password;

    createMutation.mutate(
      {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone,
        password,
        role: data.role,
        departmentId: departmentPayload,
        storeId: storePayload,
        gender: data.gender || undefined,
        weekOffDays: data.weekOffDays.length > 0 ? data.weekOffDays : undefined,
      },
      {
        onSuccess: (createdUser) => {
          onCreated?.(createdUser);
          setCreated({ user: createdUser, password });
        },
        onError: handleSaveError,
      },
    );
  };

  // A taken email is a problem with one field, so it is shown on that field and focused. Anything
  // else is a problem with the whole save and goes in the banner at the bottom.
  function handleSaveError(err: unknown) {
    if (isDuplicateEmail(err)) {
      setError('email', { type: 'server', message: 'Someone already uses this email' });
      setFocus('email');
      return;
    }
    setSubmitError(err instanceof Error ? err.message : `Could not ${isEditing ? 'save' : 'create'} this user.`);
  }

  const departmentName = departments?.find((d) => d.id === departmentId)?.name;
  const departmentStoreId = departments?.find((d) => d.id === departmentId)?.storeId ?? null;
  const departmentStoreName = departmentStoreId ? stores?.find((s) => s.id === departmentStoreId)?.name : undefined;

  const departmentWarning =
    isDepartmentHead(role) && !departmentId
      ? `${ROLE_META[role].label}s need a department so they can see their team’s work.`
      : null;
  const storeWarning =
    departmentStoreId && storeId && departmentStoreId !== storeId
      ? `${departmentName ?? 'This department'} belongs to ${departmentStoreName ?? 'another store'}, so this is a different store.`
      : null;

  const footer = created ? undefined : (
    <>
      <Button type="button" variant="outline" size="sm" onClick={requestClose} disabled={isPending}>
        Cancel
      </Button>
      <Button type="submit" form="user-form" variant="primary" size="sm" isLoading={isPending}>
        {isEditing ? 'Save changes' : 'Create user'}
      </Button>
    </>
  );

  const modalTitle = created ? 'User created' : isEditing ? 'Edit user' : 'New user';
  const modalDescription = created
    ? `${fullName(created.user)} can now sign in.`
    : isEditing
      ? 'Update their details, role and where they work.'
      : 'Create an account and choose what they can see.';

  return (
    <Modal
      open
      onClose={created ? onClose : requestClose}
      icon={<UserPlus className="w-5 h-5" />}
      title={modalTitle}
      description={modalDescription}
      footer={footer}
      showCloseButton={false}
      draggable
    >
      {created ? (
        <PasswordSharedPanel password={created.password} email={created.user.email} onDone={onClose} />
      ) : (
        <>
          <form id="user-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <fieldset disabled={isPending} className="flex flex-col gap-5 disabled:opacity-70">
              <FormSection title="Basics">
                {isEditing && user && (
                  <AvatarUpload
                    name={fullName(user)}
                    src={resolveAvatarUrl(avatarUrl)}
                    isUploading={uploadAvatarMutation.isPending}
                    isRemoving={removeAvatarMutation.isPending}
                    onUpload={(file) =>
                      uploadAvatarMutation.mutate(
                        { id: user.id, file },
                        { onSuccess: (updated) => setAvatarUrl(updated.avatarUrl) },
                      )
                    }
                    onRemove={() =>
                      removeAvatarMutation.mutate(user.id, {
                        onSuccess: (updated) => setAvatarUrl(updated.avatarUrl),
                      })
                    }
                  />
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input id="firstName" label="First name" icon={User} autoComplete="off" error={errors.firstName?.message} {...register('firstName')} />
                  <Input id="lastName" label="Last name (optional)" icon={User} autoComplete="off" error={errors.lastName?.message} {...register('lastName')} />
                </div>

                <Input id="email" label="Email address" type="email" icon={Mail} autoComplete="off" error={errors.email?.message} {...register('email')} />

                <Input id="phone" label="Phone (optional)" type="tel" inputMode="tel" icon={Phone} autoComplete="off" error={errors.phone?.message} {...register('phone')} />
              </FormSection>

              <FormSection title="Access">
                {!isEditing && (
                  <div className="flex flex-col gap-2">
                    <Controller
                      control={control}
                      name="password"
                      render={({ field }) => (
                        <Input
                          id="password"
                          label="Password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                          icon={KeyRound}
                          autoComplete="new-password"
                          error={errors.password?.message}
                          suffix={<PasswordVisibilityToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
                          value={field.value ?? ''}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          ref={field.ref}
                        />
                      )}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setValue('password', generatePassword(), { shouldDirty: true, shouldValidate: true });
                          setShowPassword(true);
                        }}
                      >
                        <Wand2 size={13} aria-hidden />
                        Generate
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => copyText(passwordValue ?? '')}
                        disabled={!passwordValue}
                      >
                        <Copy size={13} aria-hidden />
                        Copy
                      </Button>
                    </div>
                  </div>
                )}

                <FormField htmlFor="role" label="Role" icon={ShieldCheck} hint={ROLE_META[role].description}>
                  <Controller
                    control={control}
                    name="role"
                    render={({ field }) => (
                      <Combobox
                        id="role"
                        value={field.value}
                        onChange={(value) => field.onChange(value as Role)}
                        placeholder="Search roles..."
                        options={ROLE_OPTIONS}
                      />
                    )}
                  />
                </FormField>
              </FormSection>

              <FormSection title="Placement">
                <FormField htmlFor="departmentId" label="Department" icon={Building2} warning={departmentWarning}>
                  <Controller
                    control={control}
                    name="departmentId"
                    render={({ field }) => (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <Combobox
                            id="departmentId"
                            value={field.value ?? ''}
                            onChange={(id) => handleDepartmentChange(id, field.onChange)}
                            isLoading={isDepartmentsLoading}
                            placeholder="Search departments..."
                            emptyOptionLabel="No department"
                            options={(departments ?? []).map((d) => ({ value: d.id, label: d.name }))}
                            onCreateNew={(query) => setCreatingDepartment(query)}
                            createNewLabel="Create new department"
                          />
                        </div>
                        {field.value && (
                          <EditPickedButton label={`Edit ${departmentName ?? 'department'}`} onClick={() => setEditingDepartmentId(field.value ?? null)} />
                        )}
                      </div>
                    )}
                  />
                </FormField>

                <FormField htmlFor="storeId" label="Store" icon={Store} warning={storeWarning}>
                  <Controller
                    control={control}
                    name="storeId"
                    render={({ field }) => (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <Combobox
                            id="storeId"
                            value={field.value ?? ''}
                            onChange={field.onChange}
                            isLoading={isStoresLoading}
                            placeholder="Search stores..."
                            emptyOptionLabel="No store"
                            options={(stores ?? []).map((s) => ({ value: s.id, label: s.name }))}
                            onCreateNew={(query) => setCreatingStore(query)}
                            createNewLabel="Create new store"
                          />
                        </div>
                        {field.value && (
                          <EditPickedButton label={`Edit ${stores?.find((s) => s.id === field.value)?.name ?? 'store'}`} onClick={() => setEditingStoreId(field.value ?? null)} />
                        )}
                      </div>
                    )}
                  />
                </FormField>
              </FormSection>

              <FormSection title="Checklist settings">
                <FormField htmlFor="gender" label="Gender (optional)" icon={User} hint="Used to pick the right uniform checklist in audits.">
                  <Controller
                    control={control}
                    name="gender"
                    render={({ field }) => (
                      <Combobox
                        id="gender"
                        value={field.value}
                        onChange={(value) => field.onChange(value)}
                        placeholder="Not set"
                        emptyOptionLabel="Not set"
                        options={[{ value: 'FEMALE', label: 'Female' }, { value: 'MALE', label: 'Male' }]}
                      />
                    )}
                  />
                </FormField>

                <FormField
                  label="Week off"
                  icon={CalendarOff}
                  hint="No daily checklists for them on these days."
                  error={errors.weekOffDays?.message}
                >
                  <Controller
                    control={control}
                    name="weekOffDays"
                    render={({ field }) => (
                      <WeekdayPicker value={field.value} onChange={field.onChange} tone="off" maxSelected={6} aria-label="Weekly days off" />
                    )}
                  />
                </FormField>
              </FormSection>
            </fieldset>

            {submitError && <InlineError message={submitError} />}
          </form>

          {isEditing && user && <ResetPasswordSection userId={user.id} email={user.email} />}
        </>
      )}

      {creatingDepartment !== null && (
        <DepartmentForm
          nested
          onClose={() => setCreatingDepartment(null)}
          prefillName={creatingDepartment}
          onCreated={(createdDept) => handleDepartmentChange(createdDept.id, (value) => setValue('departmentId', value, { shouldValidate: true, shouldDirty: true }))}
        />
      )}

      {editingDepartmentId && departments?.find((d) => d.id === editingDepartmentId) && (
        <DepartmentForm nested department={departments.find((d) => d.id === editingDepartmentId)} onClose={() => setEditingDepartmentId(null)} />
      )}

      {editingStoreId && stores?.find((s) => s.id === editingStoreId) && (
        <StoreForm nested store={stores.find((s) => s.id === editingStoreId)} onClose={() => setEditingStoreId(null)} />
      )}

      {creatingStore !== null && (
        <StoreForm
          nested
          onClose={() => setCreatingStore(null)}
          prefillName={creatingStore}
          onCreated={(createdStore) => setValue('storeId', createdStore.id, { shouldValidate: true, shouldDirty: true })}
        />
      )}
    </Modal>
  );
};
