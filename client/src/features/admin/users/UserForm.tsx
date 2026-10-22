import { useMemo, useRef, useState } from 'react';
import { useForm, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserPlus, ClipboardCheck, ShieldCheck, Building2, Store, KeyRound, User, Mail, Phone, CalendarOff, Copy, Wand2, Pencil, Shirt, Network, Check, AlertCircle } from 'lucide-react';
import { Input, Button, Modal, Combobox, Avatar, AvatarUpload, WeekdayPicker, InlineError, Switch, useConfirm, RoleChip, ROLE_LOOK, DepartmentChip, StoreChip, IconChip, formatWeekdays } from '../../../components';
import { cn } from '@/lib/utils';
import {
  useCreateUserMutation,
  useUpdateUserMutation,
  useDepartmentsQuery,
  useUsersQuery,
  useUploadUserAvatarMutation,
  useRemoveUserAvatarMutation,
} from '../hook';
import { useStoresQuery } from '../../tickets/hook';
import { resolveAvatarUrl } from '../../../lib/uploadsBase';
import { ApiError } from '../../../api/http';
import { DepartmentForm } from '../department/DepartmentForm';
import { StoreForm } from '../store/StoreForm';
import { DressTypeFormDialog } from '../dressTypes/DressTypeFormDialog';
import { useDressTypesQuery } from '../dressTypes/hook';
import type { AdminUser, Role, UpdateUserPayload } from '../../../api/admin';
import { ROLE_META, ROLE_ORDER, isDepartmentHead } from '../roleBadge';
import { useAuth } from '../../../context/AuthContext';
import { FormField, FormPreview, FormSection } from './FormField';
import { PasswordSharedPanel, PasswordVisibilityToggle, ResetPasswordSection } from './PasswordPanels';
import { MIN_PASSWORD_LENGTH, copyText, generatePassword } from './passwordTools';
import { fullName } from './userDisplay';

const buildUserSchema = (isEditing: boolean) =>
  z
    .object({
      firstName: z.string().trim().min(1, 'First name is required'),
      lastName: z.string().trim().optional(),
      email: z.string().trim().toLowerCase().email('Enter a valid email address'),
      phone: z
        .string()
        .trim()
        .refine((v) => !v || /^\d{10,15}$/.test(v.replace(/[\s\-().[\]{}]/g, '').replace(/^\+/, '')), 'Enter a valid phone number (10 to 15 digits)')
        .optional(),
      password: z.string().optional(),
      role: z.enum(['ADMIN', 'APPROVAL_MANAGER', 'SENIOR', 'MANAGER', 'AGENT', 'USER', 'PC'] as const),
      departmentId: z.string().optional(),
      storeId: z.string().optional(),
      gender: z.enum(['', 'FEMALE', 'MALE']),
      dressTypeId: z.string(),
      reportsToId: z.string(),
      weekOffDays: z.array(z.number()).max(6, 'Leave at least one working day'),
    })
    .superRefine((data, ctx) => {
      if (isEditing) return;
      const pw = data.password ?? '';
      const message =
        pw.length < MIN_PASSWORD_LENGTH ? `Use at least ${MIN_PASSWORD_LENGTH} characters`
        : pw.length > 72 ? 'Use at most 72 characters'
        : !/[A-Z]/.test(pw) ? 'Add a capital letter'
        : !/[0-9]/.test(pw) ? 'Add a number'
        : null;
      if (message) ctx.addIssue({ code: 'custom', path: ['password'], message });
    });

type UserFields = z.infer<ReturnType<typeof buildUserSchema>>;

interface UserFormProps {
  onClose: () => void;
  user?: AdminUser;
  onCreated?: (user: AdminUser) => void;
  prefill?: { firstName?: string; lastName?: string; departmentId?: string };
}

const isDuplicateEmail = (err: unknown) =>
  err instanceof ApiError ? err.status === 409 : err instanceof Error && /already/i.test(err.message);

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

const PILL_CLASS = 'flex items-center gap-2 min-h-11 sm:min-h-10 px-2.5 rounded-xl border text-left transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40';
const pillState = (on: boolean) => (on ? 'border-primary-500 bg-primary-500/8 dark:bg-primary-500/15' : 'border-border bg-surface hover:border-primary-300');

const RolePicker = ({ value, onChange, roles }: { value: Role; onChange: (role: Role) => void; roles: Role[] }) => (
  <div role="radiogroup" aria-label="Role" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
    {roles.map((r) => {
      const { icon: Icon, tone } = ROLE_LOOK[r];
      const on = r === value;
      return (
        <button key={r} type="button" role="radio" aria-checked={on} onClick={() => onChange(r)} className={cn(PILL_CLASS, pillState(on))}>
          <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full text-white', tone)}>
            <Icon className="size-3.5" strokeWidth={2.5} aria-hidden />
          </span>
          <span className={cn('min-w-0 flex-1 truncate t-meta font-display font-semibold', on ? 'text-text' : 'text-text-secondary')}>{ROLE_META[r].label}</span>
          {on && <Check className="size-3.5 shrink-0 text-primary-600 dark:text-primary-400" strokeWidth={3} aria-hidden />}
        </button>
      );
    })}
  </div>
);

const GENDER_CHOICES = [
  { value: '', label: 'Not set' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'MALE', label: 'Male' },
] as const;

const GenderPicker = ({ value, onChange }: { value: string; onChange: (value: '' | 'FEMALE' | 'MALE') => void }) => (
  <div role="radiogroup" aria-label="Gender" className="grid grid-cols-3 gap-2">
    {GENDER_CHOICES.map((g) => {
      const on = g.value === value;
      return (
        <button key={g.value || 'none'} type="button" role="radio" aria-checked={on} onClick={() => onChange(g.value)} className={cn(PILL_CLASS, 'justify-center', pillState(on))}>
          {on && <Check className="size-3.5 shrink-0 text-primary-600 dark:text-primary-400" strokeWidth={3} aria-hidden />}
          <span className={cn('t-meta font-display font-semibold', on ? 'text-text' : 'text-text-secondary')}>{g.label}</span>
        </button>
      );
    })}
  </div>
);

export const UserForm = ({ onClose, user, onCreated, prefill }: UserFormProps) => {
  const isEditing = Boolean(user);
  const confirm = useConfirm();
  const { user: me } = useAuth();
  const roleChoices = ROLE_ORDER.filter((r) => !(me?.role === 'PC' && r === 'ADMIN'));
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ user: AdminUser; password: string; codeSent: boolean } | null>(null);
  const [emailCode, setEmailCode] = useState(true);

  const createMutation = useCreateUserMutation();
  const updateMutation = useUpdateUserMutation();
  const mutation = isEditing ? updateMutation : createMutation;
  const uploadAvatarMutation = useUploadUserAvatarMutation();
  const removeAvatarMutation = useRemoveUserAvatarMutation();

  const { data: departments, isPending: isDepartmentsLoading } = useDepartmentsQuery();
  const { data: stores, isPending: isStoresLoading } = useStoresQuery();

  const schema = useMemo(() => buildUserSchema(isEditing), [isEditing]);

  const [creatingDepartment, setCreatingDepartment] = useState<string | null>(null);
  const [creatingStore, setCreatingStore] = useState<string | null>(null);
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
      dressTypeId: user?.dressTypeId ?? '',
      reportsToId: user?.reportsToId ?? '',
      weekOffDays: user?.weekOffDays ? [...user.weekOffDays] : [],
      password: '',
    },
  });

  const [role, departmentId, storeId, passwordValue, genderValue, dressTypeValue, firstNameValue, lastNameValue, emailValue, weekOffValue] = useWatch({
    control,
    name: ['role', 'departmentId', 'storeId', 'password', 'gender', 'dressTypeId', 'firstName', 'lastName', 'email', 'weekOffDays'],
  });
  const isPending = mutation.isPending || isSubmitting;

  const inheritedOff = useMemo(() => {
    const fromStore = stores?.find((s) => s.id === storeId);
    if (fromStore?.weekOffDays?.length) return { days: fromStore.weekOffDays, from: fromStore.name };
    const fromDepartment = departments?.find((d) => d.id === departmentId);
    if (fromDepartment?.weekOffDays?.length) return { days: fromDepartment.weekOffDays, from: fromDepartment.name };
    return null;
  }, [stores, departments, storeId, departmentId]);

  const { data: dressTypes, isLoading: isDressTypesLoading } = useDressTypesQuery();
  const dressTypeOptions = useMemo(
    () =>
      (dressTypes ?? [])
        .filter((t) => t.id === dressTypeValue || (t.isActive && (!genderValue || !t.gender || t.gender === genderValue)))
        .map((t) => ({ value: t.id, label: t.gender ? `${t.name} (${t.gender === 'FEMALE' ? 'Women' : 'Men'})` : t.name })),
    [dressTypes, genderValue, dressTypeValue],
  );
  const [creatingDressType, setCreatingDressType] = useState<string | null>(null);

  const { data: allUsers, isLoading: isUsersLoading } = useUsersQuery();
  const reportsToOptions = useMemo(
    () =>
      (allUsers ?? [])
        .filter((u) => u.id !== user?.id && (u.id === user?.reportsToId || (u.isActive && (isDepartmentHead(u.role) || u.role === 'PC' || u.role === 'ADMIN'))))
        .map((u) => ({ value: u.id, label: `${fullName(u)} (${ROLE_META[u.role].label})` })),
    [allUsers, user?.id, user?.reportsToId],
  );

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

  const requestCloseCreated = async () => {
    const leave = await confirm({
      title: 'Close without sharing the password?',
      description: 'This is the only time the temporary password is shown. If you have not copied it, you will need to reset it.',
      confirmLabel: 'Close',
      cancelLabel: 'Go back',
      variant: 'danger',
    });
    if (leave) onClose();
  };

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

  const onSubmit = async (data: UserFields) => {
    setSubmitError(null);
    const departmentPayload = data.departmentId || undefined;
    const storePayload = data.storeId || undefined;
    const phone = data.phone?.trim() || undefined;
    const dressTypeId = data.dressTypeId || null;
    const reportsToId = data.reportsToId || null;

    if (isEditing && user) {
      const payload: UpdateUserPayload = {};
      if (data.firstName !== user.firstName) payload.firstName = data.firstName;
      if ((data.lastName ?? '') !== (user.lastName ?? '')) payload.lastName = data.lastName ?? '';
      if (data.email.trim().toLowerCase() !== user.email.toLowerCase()) payload.email = data.email;
      if ((phone ?? null) !== ((user.phone?.trim() || null))) payload.phone = phone ?? '';
      if (data.role !== user.role) payload.role = data.role;
      if ((departmentPayload ?? null) !== (user.departmentId ?? null)) payload.departmentId = departmentPayload ?? null;
      if ((storePayload ?? null) !== (user.storeId ?? null)) payload.storeId = storePayload ?? null;
      if ((data.gender || null) !== (user.gender ?? null)) payload.gender = data.gender || null;
      if (dressTypeId !== (user.dressTypeId ?? null)) payload.dressTypeId = dressTypeId;
      if (reportsToId !== (user.reportsToId ?? null)) payload.reportsToId = reportsToId;
      if (JSON.stringify([...data.weekOffDays].sort()) !== JSON.stringify([...(user.weekOffDays ?? [])].sort())) payload.weekOffDays = data.weekOffDays;

      if (Object.keys(payload).length === 0) {
        onClose();
        return;
      }
      if (payload.role) {
        const ok = await confirm({
          title: `Change ${fullName(user)} to ${ROLE_META[payload.role].label}?`,
          description: `They go from ${ROLE_META[user.role].label} to ${ROLE_META[payload.role].label}. What they can see and do changes right away.`,
          confirmLabel: 'Change role',
        });
        if (!ok) return;
      }
      updateMutation.mutate({ id: user.id, payload }, { onSuccess: onClose, onError: handleSaveError });
      return;
    }

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
        dressTypeId: dressTypeId ?? undefined,
        reportsToId: reportsToId ?? undefined,
        weekOffDays: data.weekOffDays.length > 0 ? data.weekOffDays : undefined,
        sendSetupCode: emailCode,
      },
      {
        onSuccess: (createdUser) => {
          onCreated?.(createdUser);
          setCreated({ user: createdUser, password, codeSent: createdUser.setupCodeSent });
        },
        onError: handleSaveError,
      },
    );
  };

  function handleSaveError(err: unknown) {
    if (isDuplicateEmail(err) && err instanceof Error && /phone/i.test(err.message)) {
      setError('phone', { type: 'server', message: 'Someone already uses this phone number' });
      setFocus('phone');
      return;
    }
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

  const storeName = stores?.find((s) => s.id === storeId)?.name;
  const previewName = [firstNameValue, lastNameValue].map((v) => v?.trim()).filter(Boolean).join(' ');

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
      onClose={created ? requestCloseCreated : requestClose}
      icon={<UserPlus className="w-5 h-5" />}
      title={modalTitle}
      description={modalDescription}
      footer={footer}
      size="lg"
      showCloseButton={false}
      draggable
    >
      {created ? (
        <PasswordSharedPanel password={created.password} email={created.user.email} codeSent={created.codeSent} onDone={onClose} />
      ) : (
        <>
          <form id="user-form" onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <fieldset disabled={isPending} className="flex flex-col gap-4 sm:gap-5 disabled:opacity-70">
              <FormPreview
                lead={<Avatar name={previewName || 'New person'} src={isEditing ? resolveAvatarUrl(avatarUrl) : null} size="lg" />}
                title={previewName || 'New person'}
                subtitle={emailValue?.trim() || 'Email not added yet'}
                chips={
                  <>
                    <RoleChip role={role} />
                    {departmentName ? (
                      <DepartmentChip name={departmentName} />
                    ) : (
                      isDepartmentHead(role) && <IconChip icon={AlertCircle} tone="bg-warning" label="No department" labelClassName="text-warning" />
                    )}
                    {storeName && <StoreChip name={storeName} />}
                    {weekOffValue.length > 0 ? <IconChip icon={CalendarOff} tone="bg-text-muted" label={`Off ${formatWeekdays(weekOffValue)}`} /> : inheritedOff && <IconChip icon={CalendarOff} tone="bg-text-muted" label={`Off ${formatWeekdays(inheritedOff.days)} (${inheritedOff.from})`} />}
                  </>
                }
              />

              <FormSection title="Basics" icon={User} description="Who they are and how to reach them.">
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

                <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                  <Input id="firstName" label="First name" icon={User} autoComplete="off" error={errors.firstName?.message} {...register('firstName')} />
                  <Input id="lastName" label="Last name (optional)" icon={User} autoComplete="off" error={errors.lastName?.message} {...register('lastName')} />
                </div>

                <Input id="email" label="Email address" type="email" icon={Mail} autoComplete="off" error={errors.email?.message} {...register('email')} />

                <Input id="phone" label="Phone (optional)" type="tel" inputMode="tel" icon={Phone} autoComplete="off" error={errors.phone?.message} {...register('phone')} />
              </FormSection>

              <FormSection title="Access" icon={ShieldCheck} description="How they sign in and what they can see.">
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
                    <label htmlFor="send-setup-code" className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-surface-hover/40 px-3 py-2.5 cursor-pointer">
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="t-meta font-display font-semibold text-text">Email them a code to set their own password</span>
                        <span className="t-meta text-text-muted">A 6-digit code, good for 24 hours. The password above still works too.</span>
                      </span>
                      <Switch id="send-setup-code" checked={emailCode} onChange={setEmailCode} />
                    </label>
                  </div>
                )}

                <FormField label="Role" icon={ShieldCheck} hint={ROLE_META[role].description}>
                  <Controller
                    control={control}
                    name="role"
                    render={({ field }) => <RolePicker value={field.value} onChange={field.onChange} roles={roleChoices} />}
                  />
                </FormField>
              </FormSection>

              <FormSection title="Placement" icon={Building2} description="The department and store they work in.">
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

              <FormSection title="Checklist settings" icon={ClipboardCheck} description="Used by audits and daily checklists.">
                <FormField label="Gender (optional)" icon={User} hint="Used to pick the right uniform checklist in audits.">
                  <Controller
                    control={control}
                    name="gender"
                    render={({ field }) => (
                      <GenderPicker
                        value={field.value}
                        onChange={(value) => {
                          field.onChange(value);
                          const picked = dressTypes?.find((t) => t.id === getValues('dressTypeId'));
                          if (picked?.gender && value && picked.gender !== value) {
                            setValue('dressTypeId', '', { shouldDirty: true });
                          }
                        }}
                      />
                    )}
                  />
                </FormField>

                <FormField
                  htmlFor="dressTypeId"
                  label="Dress type (optional)"
                  icon={Shirt}
                  hint="An audit checks them against this type's list. No type uses their gender's list."
                >
                  <Controller
                    control={control}
                    name="dressTypeId"
                    render={({ field }) => (
                      <Combobox
                        id="dressTypeId"
                        value={field.value}
                        onChange={field.onChange}
                        isLoading={isDressTypesLoading}
                        placeholder="No type"
                        emptyOptionLabel="No type"
                        options={dressTypeOptions}
                        onCreateNew={(query) => setCreatingDressType(query)}
                        createNewLabel="Create new type"
                      />
                    )}
                  />
                </FormField>

                <FormField
                  htmlFor="reportsToId"
                  label="Reports to (optional)"
                  icon={Network}
                  hint="Their own head. A late approval in their area is flagged to this person as well."
                >
                  <Controller
                    control={control}
                    name="reportsToId"
                    render={({ field }) => (
                      <Combobox
                        id="reportsToId"
                        value={field.value}
                        onChange={field.onChange}
                        isLoading={isUsersLoading}
                        placeholder="Nobody"
                        emptyOptionLabel="Nobody"
                        options={reportsToOptions}
                      />
                    )}
                  />
                </FormField>

                <FormField
                  label="Week off"
                  icon={CalendarOff}
                  hint={inheritedOff && weekOffValue.length === 0 ? `No week off set here, so they follow ${inheritedOff.from}: off ${formatWeekdays(inheritedOff.days)}. Pick days to override it.` : 'No daily checklists for them on these days.'}
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

      {creatingDressType !== null && (
        <DressTypeFormDialog
          nested
          prefillName={creatingDressType}
          onClose={() => setCreatingDressType(null)}
          onCreated={(created) => setValue('dressTypeId', created.id, { shouldValidate: true, shouldDirty: true })}
        />
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
