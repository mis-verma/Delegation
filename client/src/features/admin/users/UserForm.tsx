import { useState, useMemo } from 'react';
import { useForm, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserPlus, AlertCircle, ShieldCheck, Building2, Store, KeyRound, User, Mail, Eye, EyeOff, CalendarOff } from 'lucide-react';
import { Input, Button, Modal, Combobox, AvatarUpload, WeekdayPicker } from '../../../components';
import {
  useCreateUserMutation,
  useUpdateUserMutation,
  useDepartmentsQuery,
  useResetUserPasswordMutation,
  useUploadUserAvatarMutation,
  useRemoveUserAvatarMutation,
} from '../hook';
import { useStoresQuery } from '../../tickets/hook';
import { resolveAvatarUrl } from '../../../lib/uploadsBase';
import { DepartmentForm } from '../department/DepartmentForm';
import { StoreForm } from '../store/StoreForm';
import type { AdminUser, Gender, Role } from '../../../api/admin';

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'USER', label: 'User' },
  { value: 'AGENT', label: 'Agent' },
  { value: 'MANAGER', label: 'Manager' },
  { value: 'SENIOR', label: 'Senior (Store Head)' },
  { value: 'PC', label: 'Process coordinator (PC)' },
  { value: 'APPROVAL_MANAGER', label: 'Approval Manager' },
  { value: 'ADMIN', label: 'Admin' },
];

// Which scope dimension each role needs assigned to see role-scoped data, and the warning to
// show when it's missing. MANAGER/PC are department-scoped; SENIOR is store-scoped.
const ROLE_SCOPE_WARNING: Partial<Record<Role, { field: 'departmentId' | 'storeId'; message: string }>> = {
  MANAGER: { field: 'departmentId', message: "A Manager without a department won't see scoped data — assign one for full functionality." },
  PC: { field: 'departmentId', message: "A Process Coordinator without a department won't see scoped data — assign one for full functionality." },
  SENIOR: { field: 'storeId', message: "A Senior without a store won't see scoped data — assign one for full functionality." },
};

const buildUserSchema = (isEditing: boolean) =>
  z
    .object({
      firstName: z.string().trim().min(1, 'First name is required'),
      lastName: z.string().trim().optional(),
      email: z.string().trim().email('Enter a valid email address'),
      password: z.string().optional(),
      role: z.enum(['ADMIN', 'APPROVAL_MANAGER', 'SENIOR', 'MANAGER', 'AGENT', 'USER', 'PC'] as const),
      departmentId: z.string().optional(),
      storeId: z.string().optional(),
    })
    .superRefine((data, ctx) => {
      if (!isEditing && (!data.password || data.password.length < 8)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['password'],
          message: 'Password must be at least 8 characters',
        });
      }
    });

type UserFields = z.infer<ReturnType<typeof buildUserSchema>>;

interface UserFormProps {
  onClose: () => void;
  user?: AdminUser;
  /** Called with the newly-created user right after a successful create (not fired when editing). */
  onCreated?: (user: AdminUser) => void;
  /** Seeds fields on a fresh create (e.g. a name — and department, if it was also mentioned —
   *  typed in Smart Add that didn't match anyone) without treating this as an edit — `user` above
   *  is what triggers edit mode. */
  prefill?: { firstName?: string; lastName?: string; departmentId?: string };
}

// Deliberately separate from the main react-hook-form flow above — this is its own mutation
// (POST /users/:id/reset-password), not a field on the profile-update payload, so it shouldn't
// fire just because the admin clicked "Save changes" on an unrelated edit.
const ResetPasswordSection = ({ userId }: { userId: string }) => {
  const [expanded, setExpanded] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const resetMutation = useResetUserPasswordMutation();

  const collapse = () => {
    setExpanded(false);
    setPassword('');
    setError(null);
  };

  const handleReset = () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    resetMutation.mutate({ id: userId, password }, { onSuccess: collapse });
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex items-center gap-1.5 self-start text-xs font-display font-medium text-text-secondary hover:text-primary-600 dark:hover:text-primary-400 transition-colors pt-3 mt-1 border-t border-border w-full"
      >
        <KeyRound className="w-3.5 h-3.5" />
        Reset password
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 pt-3 mt-1 border-t border-border">
      <Input
        id="reset-password"
        label="New password"
        type="password"
        placeholder="Min. 8 characters"
        icon={KeyRound}
        value={password}
        onChange={(e) => { setPassword(e.target.value); setError(null); }}
        error={error ?? undefined}
        autoFocus
      />
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={collapse} disabled={resetMutation.isPending}>
          Cancel
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={handleReset} isLoading={resetMutation.isPending}>
          Set new password
        </Button>
      </div>
    </div>
  );
};

export const UserForm = ({ onClose, user, onCreated, prefill }: UserFormProps) => {
  const isEditing = Boolean(user);
  // Tracked locally (seeded from `user`, then updated straight from each mutation's response)
  // rather than re-read from `user` on every render — `user` is a snapshot captured when this
  // modal was opened, so it won't reflect a photo change made a moment ago in this same session.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [showPassword, setShowPassword] = useState(false);
  // Weekly day(s) off — no daily checklists for this person on these days. Edit mode only (a new
  // user sets their own from My account, or an admin sets it here afterwards).
  const [weekOffDays, setWeekOffDays] = useState<number[]>(user?.weekOffDays ?? []);
  // Picks which uniform list an audit checks this person against (a question can have a separate
  // female and male list). '' = not set: they get the question's main list.
  const [gender, setGender] = useState<Gender | ''>(user?.gender ?? '');

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

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<UserFields>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: user?.firstName ?? prefill?.firstName ?? '',
      lastName: user?.lastName ?? prefill?.lastName ?? '',
      email: user?.email ?? '',
      role: user?.role ?? 'USER',
      departmentId: user?.departmentId ?? prefill?.departmentId ?? '',
      storeId: user?.storeId ?? '',
      password: '',
    },
  });

  const [role, departmentId, storeId] = useWatch({ control, name: ['role', 'departmentId', 'storeId'] });
  const isPending = mutation.isPending || isSubmitting;

  const onSubmit = (data: UserFields) => {
    const departmentPayload = data.departmentId || undefined;
    const storePayload = data.storeId || undefined;

    if (isEditing && user) {
      updateMutation.mutate(
        {
          id: user.id,
          payload: {
            firstName: data.firstName,
            lastName: data.lastName || undefined,
            email: data.email,
            role: data.role,
            departmentId: departmentPayload ?? null,
            storeId: storePayload ?? null,
            gender: gender || null,
            weekOffDays,
          },
        },
        { onSuccess: onClose }
      );
      return;
    }

    // The zod schema's superRefine (above) already blocks submission without a valid password
    // when creating — this guard makes that guarantee visible to the type checker too, instead
    // of asserting past it, so a future edit that loosens the schema fails loudly here rather
    // than silently sending an undefined password to the API.
    if (!data.password) return;

    createMutation.mutate(
      {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        password: data.password,
        role: data.role,
        departmentId: departmentPayload,
        storeId: storePayload,
        gender: gender || undefined,
      },
      {
        onSuccess: (created) => {
          onCreated?.(created);
          onClose();
        },
      }
    );
  };

  const scopeWarning = ROLE_SCOPE_WARNING[role];
  const scopeValue = scopeWarning?.field === 'storeId' ? storeId : departmentId;
  const roleWarning = scopeWarning && !scopeValue ? scopeWarning.message : null;

  const footer = (
    <>
      <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isPending}>
        Cancel
      </Button>
      <Button type="submit" form="user-form" variant="primary" size="sm" isLoading={isPending}>
        {isEditing ? 'Save changes' : 'Create user'}
      </Button>
    </>
  );

  return (
    <Modal
      open
      onClose={() => !isPending && onClose()}
      icon={<UserPlus className="w-5 h-5" />}
      title={isEditing ? 'Edit user' : 'New user'}
      description={
        isEditing
          ? "Update user's profile details, assigned role, or department."
          : 'Create a new user account and set initial permissions.'
      }
      footer={footer}
      showCloseButton={false}
      draggable
    >
      <form id="user-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <fieldset disabled={isPending} className="flex flex-col gap-4 disabled:opacity-60">
          {isEditing && user && (
            <AvatarUpload
              name={`${user.firstName} ${user.lastName ?? ''}`}
              src={resolveAvatarUrl(avatarUrl)}
              isUploading={uploadAvatarMutation.isPending}
              isRemoving={removeAvatarMutation.isPending}
              onUpload={(file) =>
                uploadAvatarMutation.mutate(
                  { id: user.id, file },
                  { onSuccess: (updated) => setAvatarUrl(updated.avatarUrl) }
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
            <Input
              id="firstName"
              label="First name"
              icon={User}
              error={errors.firstName?.message}
              {...register('firstName')}
            />
            <Input
              id="lastName"
              label="Last name (optional)"
              icon={User}
              error={errors.lastName?.message}
              {...register('lastName')}
            />
          </div>

          <Input
            id="email"
            label="Email address"
            type="email"
            icon={Mail}
            error={errors.email?.message}
            {...register('email')}
          />

          {!isEditing && (
            <Input
              id="password"
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Min. 8 characters"
              icon={KeyRound}
              error={errors.password?.message}
              suffix={
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="text-text-light hover:text-text transition-colors cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              }
              {...register('password')}
            />
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="role" className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
              <ShieldCheck className="w-3.5 h-3.5 text-text-light" strokeWidth={2.5} />
              Role
            </label>
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
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="gender" className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
              <User className="w-3.5 h-3.5 text-text-light" strokeWidth={2.5} />
              Gender
            </label>
            <Combobox
              id="gender"
              value={gender}
              onChange={(value) => setGender(value as Gender | '')}
              placeholder="Not set"
              emptyOptionLabel="Not set"
              options={[{ value: 'FEMALE', label: 'Female' }, { value: 'MALE', label: 'Male' }]}
            />
            <p className="text-[11px] text-text-muted">Used to pick the right uniform checklist in audits.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="departmentId" className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
              <Building2 className="w-3.5 h-3.5 text-text-light" strokeWidth={2.5} />
              Department
            </label>
            <Controller
              control={control}
              name="departmentId"
              render={({ field }) => (
                <Combobox
                  id="departmentId"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  isLoading={isDepartmentsLoading}
                  placeholder="Search departments..."
                  emptyOptionLabel="No department"
                  options={(departments ?? []).map(d => ({ value: d.id, label: d.name }))}
                  onCreateNew={(query) => setCreatingDepartment(query)}
                  createNewLabel="Create new department"
                />
              )}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="storeId" className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
              <Store className="w-3.5 h-3.5 text-text-light" strokeWidth={2.5} />
              Store
            </label>
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
                  options={(stores ?? []).map(s => ({ value: s.id, label: s.name }))}
                  onCreateNew={(query) => setCreatingStore(query)}
                  createNewLabel="Create new store"
                />
              )}
            />

            {roleWarning && (
              <div className="flex items-start gap-1.5 text-xs text-warning font-display mt-1">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>{roleWarning}</span>
              </div>
            )}
          </div>

          {isEditing && (
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                <CalendarOff className="w-3.5 h-3.5 text-text-light" strokeWidth={2.5} />
                Week off
                <span className="font-normal text-text-muted">· no daily checklists on these days</span>
              </span>
              <WeekdayPicker value={weekOffDays} onChange={setWeekOffDays} tone="off" maxSelected={6} aria-label="Weekly days off" />
            </div>
          )}

          {isEditing && user && <ResetPasswordSection userId={user.id} />}
        </fieldset>

        {mutation.isError && (
          <div className="flex items-center gap-2 text-xs text-danger font-display bg-danger/10 p-2.5 rounded-lg">
            <AlertCircle size={14} className="shrink-0" />
            <span>
              {mutation.error instanceof Error
                ? mutation.error.message
                : `Failed to ${isEditing ? 'update' : 'create'} user.`}
            </span>
          </div>
        )}
      </form>

      {creatingDepartment !== null && (
        <DepartmentForm
          onClose={() => setCreatingDepartment(null)}
          prefillName={creatingDepartment}
          onCreated={(created) => setValue('departmentId', created.id, { shouldValidate: true })}
        />
      )}

      {creatingStore !== null && (
        <StoreForm
          onClose={() => setCreatingStore(null)}
          prefillName={creatingStore}
          onCreated={(created) => setValue('storeId', created.id, { shouldValidate: true })}
        />
      )}
    </Modal>
  );
};
