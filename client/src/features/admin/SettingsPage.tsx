import { useEffect, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Settings as SettingsIcon, CheckSquare, Construction, Bell, Clock, ListChecks, KeyRound, Camera, Building2, Database, Upload, Smartphone, type LucideIcon } from 'lucide-react';
import { useBlocker } from 'react-router';
import { Input, Button, Skeleton, PageHeader, Textarea, Switch, BrandLogo, InlineError, useConfirm } from '../../components';
import { Loader } from '../../components/loaders';
import { useSettingsQuery, useUpdateSettingsMutation, useUploadLogoMutation, useRemoveLogoMutation } from './hook';
import { resolveLogoUrl } from '../../lib/uploadsBase';
import { SettingsCard } from '../settings/SettingsCard';

const IMAGE_TYPE_OPTIONS = [
  { value: 'image/jpeg', label: 'JPEG' },
  { value: 'image/png', label: 'PNG' },
  { value: 'image/webp', label: 'WEBP' },
];

const settingsSchema = z.object({
  orgName: z.string().trim().min(1, "Organization name can't be empty").max(191, 'Keep it under 191 characters'),
  defaultTatHours: z.number().positive('Must be a positive number'),
  maxUploadSizeMb: z.number().positive('Must be a positive number'),
  maxUploadFiles: z.number().int().positive('Must be a positive whole number'),
  allowedImageTypes: z.array(z.string()).min(1, 'Select at least one file type'),
  maintenanceMode: z.boolean(),
  maintenanceMessage: z.string().max(500, 'Keep it under 500 characters'),
  notifyTaskDeadlineReminders: z.boolean(),
  notifyChecklistOverdueReminders: z.boolean(),
  accessTokenExpiresMinutes: z.number().int().min(1, 'Must be at least 1 minute').max(1440, 'Must be 1440 minutes (1 day) or less'),
  refreshTokenExpiresDays: z.number().int().min(1, 'Must be at least 1 day').max(365, 'Must be 365 days or less'),
  auditRetentionDays: z.number().int().min(0, "Can't be negative").max(3650, 'Must be 3650 days (10 years) or less'),
  notificationRetentionDays: z.number().int().min(0, "Can't be negative").max(3650, 'Must be 3650 days (10 years) or less'),
  inboundMessageRetentionDays: z.number().int().min(0, "Can't be negative").max(3650, 'Must be 3650 days (10 years) or less'),
  androidAppUrl: z.string().trim().max(500).refine((v) => !v || /^https:\/\/\S+$/.test(v), 'Paste a full link starting with https://'),
  iosAppUrl: z.string().trim().max(500).refine((v) => !v || /^https:\/\/\S+$/.test(v), 'Paste a full link starting with https://'),
});

type SettingsFields = z.infer<typeof settingsSchema>;

interface SwitchRowProps {
  icon: LucideIcon;
  iconClassName?: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  id: string;
}

const SwitchRow = ({ icon: Icon, iconClassName = 'text-primary-500', label, description, checked, onChange, id }: SwitchRowProps) => (
  <div className="flex items-center justify-between gap-4">
    <div className="flex items-center gap-2.5">
      <Icon size={16} className={`${iconClassName} shrink-0`} />
      <div className="flex flex-col">
        <span className="text-sm font-display font-semibold text-text">{label}</span>
        <span className="text-xs text-text-muted">{description}</span>
      </div>
    </div>
    <Switch checked={checked} onChange={onChange} id={id} />
  </div>
);

interface LogoUploadProps {
  src: string | null;
  onUpload: (file: File) => void;
  onRemove: () => void;
  isUploading?: boolean;
  isRemoving?: boolean;
}

const LogoUpload = ({ src, onUpload, onRemove, isUploading, isRemoving }: LogoUploadProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = Boolean(isUploading || isRemoving);
  const pickFile = () => inputRef.current?.click();

  return (
    <div className="flex items-center gap-4">
      <div className="relative group/logo shrink-0 flex items-center justify-center size-16 rounded-xl border border-border bg-surface overflow-hidden">
        {src ? (
          <img src={src} alt="Organization logo" className="max-w-full max-h-full object-contain p-2" />
        ) : (
          <BrandLogo className="size-10" showWordmark={false} tile />
        )}
        <button
          type="button"
          onClick={pickFile}
          disabled={busy}
          className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 group-hover/logo:opacity-100 focus-visible:opacity-100 transition-opacity duration-200 cursor-pointer disabled:cursor-not-allowed outline-none"
          aria-label="Change organization logo"
        >
          {isUploading ? <Loader size="sm" variant="white" /> : <Camera className="w-5 h-5" />}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(file);
            e.target.value = '';
          }}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium text-text-secondary">Logo</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={pickFile}
            disabled={busy}
            className="text-xs font-display font-medium text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline cursor-pointer"
          >
            {src ? 'Change logo' : 'Upload logo'}
          </button>
          {src && (
            <>
              <span className="text-text-light">·</span>
              <button
                type="button"
                onClick={onRemove}
                disabled={busy}
                className="text-xs font-display font-medium text-danger hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline cursor-pointer"
              >
                {isRemoving ? 'Removing…' : 'Remove'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export const SettingsPage = () => {
  const { data: settings, isPending, isError, refetch } = useSettingsQuery();
  const confirm = useConfirm();
  const mutation = useUpdateSettingsMutation();
  const uploadLogoMutation = useUploadLogoMutation();
  const removeLogoMutation = useRemoveLogoMutation();

  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    formState: { errors, isDirty },
  } = useForm<SettingsFields>({
    resolver: zodResolver(settingsSchema),
  });

  const maintenanceMode = watch('maintenanceMode');

  useEffect(() => {
    if (settings) {
      reset({ ...settings, maintenanceMessage: settings.maintenanceMessage ?? '', androidAppUrl: settings.androidAppUrl ?? '', iosAppUrl: settings.iosAppUrl ?? '' });
      setLogoUrl(settings.logoUrl);
    }
  }, [settings, reset]);

  const blocker = useBlocker(isDirty);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    void confirm({
      title: 'Leave without saving?',
      description: 'Your changes to Settings have not been saved.',
      confirmLabel: 'Leave',
      cancelLabel: 'Stay',
      variant: 'danger',
    }).then((leave) => (leave ? blocker.proceed() : blocker.reset()));
  }, [blocker, confirm]);
  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  const onSubmit = (data: SettingsFields) =>
    mutation.mutate({ ...data, maintenanceMessage: data.maintenanceMessage.trim() || null, androidAppUrl: data.androidAppUrl.trim() || null, iosAppUrl: data.iosAppUrl.trim() || null });

  if (isError && !settings) {
    return (
      <div className="flex flex-col gap-5 w-full">
        <PageHeader icon={SettingsIcon} title="Settings" subtitle="Branding, defaults, notifications, sessions and retention. These apply to everyone." />
        <InlineError message="Could not load the settings. Check your connection and try again." onRetry={() => void refetch()} />
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="flex flex-col gap-6 w-full">
        <div className="flex items-center gap-3">
          <Skeleton className="size-11 rounded-xl shrink-0" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-72" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 sm:gap-6 w-full">
      <PageHeader
        icon={SettingsIcon}
        title="Settings"
        subtitle="Branding, defaults, notifications, sessions and retention. These apply to everyone."
      />

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 w-full" noValidate>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <div className="flex flex-col gap-5">
            <SettingsCard icon={Building2} title="Branding" hint="Shown in the header, footer, login screen, and as the sender name on emails.">
              <LogoUpload
                src={resolveLogoUrl(logoUrl)}
                isUploading={uploadLogoMutation.isPending}
                isRemoving={removeLogoMutation.isPending}
                onUpload={(file) => uploadLogoMutation.mutate(file, { onSuccess: (updated) => setLogoUrl(updated.logoUrl) })}
                onRemove={() => removeLogoMutation.mutate(undefined, { onSuccess: (updated) => setLogoUrl(updated.logoUrl) })}
              />
              <Input
                id="orgName"
                label="Organization name"
                placeholder="Karya"
                error={errors.orgName?.message}
                {...register('orgName')}
              />
            </SettingsCard>

            <SettingsCard icon={Smartphone} title="Mobile app" hint="Shown on everyone's profile under Get the app, and on the page people open from the app link. Leave a box empty to hide that button.">
              <Input id="androidAppUrl" label="Android app download link" placeholder="https://..." inputMode="url" error={errors.androidAppUrl?.message} {...register('androidAppUrl')} />
              <Input id="iosAppUrl" label="iPhone App Store link" placeholder="https://apps.apple.com/..." inputMode="url" error={errors.iosAppUrl?.message} {...register('iosAppUrl')} />
            </SettingsCard>

            <SettingsCard icon={Upload} title="Tickets and uploads" hint="The default due time for a new ticket, and the limits on what people can attach.">
              <Input
                id="defaultTatHours"
                label="Default ticket TAT (hours)"
                type="number"
                step="1"
                suffix={<span className="text-xs text-text-light">hours</span>}
                error={errors.defaultTatHours?.message}
                {...register('defaultTatHours', { valueAsNumber: true })}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  id="maxUploadSizeMb"
                  label="Max upload size per file"
                  type="number"
                  step="1"
                  suffix={<span className="text-xs text-text-light">MB</span>}
                  error={errors.maxUploadSizeMb?.message}
                  {...register('maxUploadSizeMb', { valueAsNumber: true })}
                />
                <Input
                  id="maxUploadFiles"
                  label="Max files per upload"
                  type="number"
                  step="1"
                  error={errors.maxUploadFiles?.message}
                  {...register('maxUploadFiles', { valueAsNumber: true })}
                />
              </div>

              <Controller
                control={control}
                name="allowedImageTypes"
                render={({ field }) => (
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-display font-medium text-text-secondary">Allowed image types</span>
                    <div className="flex flex-wrap gap-2">
                      {IMAGE_TYPE_OPTIONS.map((opt) => {
                        const checked = field.value?.includes(opt.value) ?? false;
                        return (
                          <label
                            key={opt.value}
                            className={`flex items-center gap-2 h-10 pointer-coarse:h-11 px-3.5 rounded-xl border text-sm font-display font-medium cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-500/40 ${
                              checked ? 'border-primary-500/50 bg-primary-500/10 text-primary-700 dark:text-primary-300' : 'border-border bg-surface text-text-secondary hover:border-border-hover'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={checked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...(field.value ?? []), opt.value]
                                  : (field.value ?? []).filter((v: string) => v !== opt.value);
                                field.onChange(next);
                              }}
                            />
                            <span className={`flex items-center justify-center size-4 rounded border ${checked ? 'bg-primary-500 border-primary-500' : 'bg-surface border-border'}`}>
                              {checked && <CheckSquare size={11} className="text-white" />}
                            </span>
                            {opt.label}
                          </label>
                        );
                      })}
                    </div>
                    {errors.allowedImageTypes && (
                      <span className="text-xs font-medium text-danger">{errors.allowedImageTypes.message}</span>
                    )}
                  </div>
                )}
              />
            </SettingsCard>

            <SettingsCard icon={Database} title="Data retention" hint="How long each type of record is kept before a nightly sweep deletes it. Set any of these to 0 to keep that record forever, the right choice if you must retain audit history indefinitely.">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  id="auditRetentionDays"
                  label="Audit log"
                  type="number"
                  step="1"
                  suffix={<span className="text-xs text-text-light">days</span>}
                  error={errors.auditRetentionDays?.message}
                  {...register('auditRetentionDays', { valueAsNumber: true })}
                />
                <Input
                  id="notificationRetentionDays"
                  label="Notifications"
                  type="number"
                  step="1"
                  suffix={<span className="text-xs text-text-light">days</span>}
                  error={errors.notificationRetentionDays?.message}
                  {...register('notificationRetentionDays', { valueAsNumber: true })}
                />
                <Input
                  id="inboundMessageRetentionDays"
                  label="Inbound messages"
                  type="number"
                  step="1"
                  suffix={<span className="text-xs text-text-light">days</span>}
                  error={errors.inboundMessageRetentionDays?.message}
                  {...register('inboundMessageRetentionDays', { valueAsNumber: true })}
                />
              </div>
            </SettingsCard>
          </div>

          <div className="flex flex-col gap-5">
            <SettingsCard icon={Bell} title="Notification defaults">
              <Controller
                control={control}
                name="notifyTaskDeadlineReminders"
                render={({ field }) => (
                  <SwitchRow
                    id="notifyTaskDeadlineReminders"
                    icon={Clock}
                    label="Delegation deadline reminders"
                    description="Notify assignees as a delegation's due date approaches."
                    checked={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <div className="h-px w-full bg-border" />
              <Controller
                control={control}
                name="notifyChecklistOverdueReminders"
                render={({ field }) => (
                  <SwitchRow
                    id="notifyChecklistOverdueReminders"
                    icon={ListChecks}
                    label="Checklist overdue reminders"
                    description="Notify assignees and store PCs when a checklist runs past its deadline."
                    checked={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </SettingsCard>

            <SettingsCard icon={KeyRound} title="Session and sign-in" hint='The app silently renews itself every access-token window, so people won&apos;t notice it. "Stay signed in for" is the one that matters day to day: how long someone can close the app and come back without logging in again. It only applies going forward; already-open sessions keep their current timing until they next refresh.'>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  id="accessTokenExpiresMinutes"
                  label="Access token lifetime"
                  type="number"
                  step="1"
                  suffix={<span className="text-xs text-text-light">min</span>}
                  error={errors.accessTokenExpiresMinutes?.message}
                  {...register('accessTokenExpiresMinutes', { valueAsNumber: true })}
                />
                <Input
                  id="refreshTokenExpiresDays"
                  label="Stay signed in for"
                  type="number"
                  step="1"
                  suffix={<span className="text-xs text-text-light">days</span>}
                  error={errors.refreshTokenExpiresDays?.message}
                  {...register('refreshTokenExpiresDays', { valueAsNumber: true })}
                />
              </div>
            </SettingsCard>

            <SettingsCard icon={Construction} title="Maintenance" tone="warning">
              <Controller
                control={control}
                name="maintenanceMode"
                render={({ field }) => (
                  <SwitchRow
                    id="maintenanceMode"
                    icon={Construction}
                    iconClassName="text-warning"
                    label="Maintenance mode"
                    description="Takes the app down for everyone except admins and PC."
                    checked={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              {maintenanceMode && (
                <Textarea
                  id="maintenanceMessage"
                  label="Message shown to users (optional)"
                  placeholder="We're rolling out some improvements right now. Back shortly."
                  rows={2}
                  error={errors.maintenanceMessage?.message}
                  {...register('maintenanceMessage')}
                />
              )}
            </SettingsCard>
          </div>
        </div>

        {mutation.isError && (
          <p role="alert" className="text-sm text-danger text-center">
            {mutation.error instanceof Error ? mutation.error.message : 'Failed to save settings.'}
          </p>
        )}

        {(isDirty || mutation.isPending) && (
          <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-500/30 bg-surface px-4 py-3">
            <p className="text-sm font-display font-medium text-text-secondary">You have unsaved changes</p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" disabled={mutation.isPending} onClick={() => reset({ ...settings, maintenanceMessage: settings?.maintenanceMessage ?? '', androidAppUrl: settings?.androidAppUrl ?? '', iosAppUrl: settings?.iosAppUrl ?? '' })}>
                Discard
              </Button>
              <Button type="submit" variant="primary" size="sm" isLoading={mutation.isPending}>
                {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
                Save changes
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};
