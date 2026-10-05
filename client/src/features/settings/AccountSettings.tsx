import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { User as UserIcon, Phone, Mail, KeyRound, Eye, EyeOff, CalendarOff } from 'lucide-react';
import { Input, Button, Skeleton, AvatarUpload, WeekdayPicker, weekdayShortName, RoleChip } from '../../components';
import { resolveAvatarUrl } from '../../lib/uploadsBase';
import {
  useMyProfileQuery,
  useUpdateMyProfileMutation,
  useChangeMyPasswordMutation,
  useUploadMyAvatarMutation,
  useRemoveMyAvatarMutation,
} from './hook';

const profileSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
});
type ProfileFields = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });
type PasswordFields = z.infer<typeof passwordSchema>;

const PasswordToggle = ({ shown, onToggle }: { shown: boolean; onToggle: () => void }) => (
  <button
    type="button"
    onClick={onToggle}
    className="text-text-light hover:text-text transition-colors cursor-pointer"
    aria-label={shown ? 'Hide password' : 'Show password'}
  >
    {shown ? <EyeOff size={15} /> : <Eye size={15} />}
  </button>
);

// Your weekly day(s) off — the daily checklist generator leaves you off those days' runs, so a
// week-off never turns into an "overdue" checklist. Keyed on the saved value by the parent so it
// re-baselines after a save.
const WeekOffCard = ({ initial, isSaving, onSave }: { initial: number[]; isSaving: boolean; onSave: (days: number[]) => void }) => {
  const [days, setDays] = useState<number[]>(initial);
  const dirty = days.join(',') !== initial.join(',');
  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl border border-border">
      <div className="flex items-center gap-2">
        <CalendarOff size={14} className="text-text-muted" />
        <span className="text-xs font-display font-bold text-text-muted">Week off</span>
        <span className="text-[11px] font-display text-text-muted">· {days.length ? days.map(weekdayShortName).join(', ') : 'None'}</span>
      </div>
      <WeekdayPicker value={days} onChange={setDays} tone="off" maxSelected={6} aria-label="Your weekly days off" />
      <p className="text-xs text-text-muted">You won't get daily checklists on these days.</p>
      <div className="flex justify-end">
        <Button type="button" variant="primary" size="sm" isLoading={isSaving} disabled={!dirty} onClick={() => onSave(days)}>
          Save week off
        </Button>
      </div>
    </div>
  );
};

// Every logged-in user's own "who am I" page — separate from Admin > Settings (system-wide
// defaults an ADMIN/PC configures for everyone) and from the admin User form (an admin editing
// someone else). Two independent forms/mutations, same as UserForm's profile-fields-vs-password
// split, since saving a name edit shouldn't require the current password and vice versa.
export const AccountSettings = () => {
  const { data: profile, isPending } = useMyProfileQuery();
  const updateProfileMut = useUpdateMyProfileMutation();
  const uploadAvatarMut = useUploadMyAvatarMutation();
  const removeAvatarMut = useRemoveMyAvatarMutation();
  const changePasswordMut = useChangeMyPasswordMutation();

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    reset: resetProfile,
    formState: { errors: profileErrors, isDirty: profileDirty },
  } = useForm<ProfileFields>({ resolver: zodResolver(profileSchema) });

  // Baselines the form from the fetched profile exactly once. Guarded past that first load so a
  // background refetch (react-query refetches on window focus/reconnect by default) can't wipe
  // out edits someone's mid-typing — a save's own success handler below re-baselines instead,
  // which is the only other moment the "clean" state should actually move.
  const initializedRef = useRef(false);
  useEffect(() => {
    if (profile && !initializedRef.current) {
      resetProfile({ firstName: profile.firstName, lastName: profile.lastName ?? '', phone: profile.phone ?? '' });
      initializedRef.current = true;
    }
  }, [profile, resetProfile]);

  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    reset: resetPasswordForm,
    formState: { errors: passwordErrors },
  } = useForm<PasswordFields>({ resolver: zodResolver(passwordSchema) });

  const onProfileSubmit = (data: ProfileFields) =>
    updateProfileMut.mutate(
      { firstName: data.firstName, lastName: data.lastName || undefined, phone: data.phone || undefined },
      {
        onSuccess: (updated) =>
          resetProfile({ firstName: updated.firstName, lastName: updated.lastName ?? '', phone: updated.phone ?? '' }),
      },
    );

  const onPasswordSubmit = (data: PasswordFields) =>
    changePasswordMut.mutate(
      { currentPassword: data.currentPassword, newPassword: data.newPassword },
      { onSuccess: () => resetPasswordForm() },
    );

  if (isPending || !profile) {
    return (
      <div className="flex flex-col gap-5 max-w-lg">
        <Skeleton className="h-52 w-full rounded-xl" />
        <Skeleton className="h-44 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 max-w-lg">
      <form onSubmit={handleProfileSubmit(onProfileSubmit)} className="flex flex-col gap-4 p-4 rounded-xl border border-border" noValidate>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <UserIcon size={14} className="text-text-muted" />
            <span className="text-xs font-display font-bold text-text-muted">Profile</span>
          </div>
          <RoleChip role={profile.role} />
        </div>

        <AvatarUpload
          name={`${profile.firstName} ${profile.lastName ?? ''}`}
          src={resolveAvatarUrl(profile.avatarUrl)}
          isUploading={uploadAvatarMut.isPending}
          isRemoving={removeAvatarMut.isPending}
          onUpload={(file) => uploadAvatarMut.mutate(file)}
          onRemove={() => removeAvatarMut.mutate()}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input id="firstName" label="First name" icon={UserIcon} error={profileErrors.firstName?.message} {...registerProfile('firstName')} />
          <Input id="lastName" label="Last name (optional)" icon={UserIcon} error={profileErrors.lastName?.message} {...registerProfile('lastName')} />
        </div>

        <div className="flex flex-col gap-1">
          <Input id="email" label="Email address" icon={Mail} value={profile.email} readOnly disabled />
          <p className="text-xs text-text-muted px-1">Contact an admin to change your email address.</p>
        </div>

        <Input id="phone" label="Phone (optional)" icon={Phone} error={profileErrors.phone?.message} {...registerProfile('phone')} />

        <div className="flex justify-end pt-1">
          <Button type="submit" variant="primary" size="sm" isLoading={updateProfileMut.isPending} disabled={!profileDirty}>
            Save changes
          </Button>
        </div>
      </form>

      <WeekOffCard
        key={(profile.weekOffDays ?? []).join(',')}
        initial={profile.weekOffDays ?? []}
        isSaving={updateProfileMut.isPending}
        onSave={(weekOffDays) => updateProfileMut.mutate({ weekOffDays })}
      />

      <form onSubmit={handlePasswordSubmit(onPasswordSubmit)} className="flex flex-col gap-4 p-4 rounded-xl border border-border" noValidate>
        <div className="flex items-center gap-2">
          <KeyRound size={14} className="text-text-muted" />
          <span className="text-xs font-display font-bold text-text-muted">Password</span>
        </div>

        <Input
          id="currentPassword"
          label="Current password"
          type={showCurrent ? 'text' : 'password'}
          autoComplete="current-password"
          error={passwordErrors.currentPassword?.message}
          suffix={<PasswordToggle shown={showCurrent} onToggle={() => setShowCurrent((v) => !v)} />}
          {...registerPassword('currentPassword')}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            id="newPassword"
            label="New password"
            type={showNew ? 'text' : 'password'}
            placeholder="Min. 8 characters"
            autoComplete="new-password"
            error={passwordErrors.newPassword?.message}
            suffix={<PasswordToggle shown={showNew} onToggle={() => setShowNew((v) => !v)} />}
            {...registerPassword('newPassword')}
          />
          <Input
            id="confirmPassword"
            label="Confirm new password"
            type={showNew ? 'text' : 'password'}
            autoComplete="new-password"
            error={passwordErrors.confirmPassword?.message}
            suffix={<PasswordToggle shown={showNew} onToggle={() => setShowNew((v) => !v)} />}
            {...registerPassword('confirmPassword')}
          />
        </div>

        {changePasswordMut.isError && (
          <p className="text-xs text-danger text-center">
            {changePasswordMut.error instanceof Error ? changePasswordMut.error.message : 'Failed to change password.'}
          </p>
        )}

        <p className="text-xs text-text-muted -mt-1">
          Changing your password signs you out of every device — you'll need to sign back in with the new one.
        </p>

        <div className="flex justify-end pt-1">
          <Button type="submit" variant="primary" size="sm" isLoading={changePasswordMut.isPending}>
            Change password
          </Button>
        </div>
      </form>
    </div>
  );
};
