import { useEffect, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Settings as SettingsIcon, CheckSquare, Construction, Bell, Clock, ListChecks, KeyRound, Camera, Building2, Database, type LucideIcon } from 'lucide-react';
import { Input, Button, Form, Skeleton, GradientIconTile, Textarea, Switch, BrandLogo } from '../../components';
import { Loader } from '../../components/loaders';
import { useSettingsQuery, useUpdateSettingsMutation, useUploadLogoMutation, useRemoveLogoMutation } from './hook';
import { resolveLogoUrl } from '../../lib/uploadsBase';

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
  // Kept as a plain string in the form (never null) — simpler than teaching RHF/Textarea about a
  // null value for what's really just "empty". Converted to `null` for the API on submit instead.
  maintenanceMessage: z.string().max(500, 'Keep it under 500 characters'),
  notifyTaskDeadlineReminders: z.boolean(),
  notifyChecklistOverdueReminders: z.boolean(),
  accessTokenExpiresMinutes: z.number().int().min(1, 'Must be at least 1 minute').max(1440, 'Must be 1440 minutes (1 day) or less'),
  refreshTokenExpiresDays: z.number().int().min(1, 'Must be at least 1 day').max(365, 'Must be 365 days or less'),
  // 0 is a valid, meaningful value here ("keep forever") — not an error state like the fields above.
  auditRetentionDays: z.number().int().min(0, "Can't be negative").max(3650, 'Must be 3650 days (10 years) or less'),
  notificationRetentionDays: z.number().int().min(0, "Can't be negative").max(3650, 'Must be 3650 days (10 years) or less'),
  inboundMessageRetentionDays: z.number().int().min(0, "Can't be negative").max(3650, 'Must be 3650 days (10 years) or less'),
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

// Same hover-to-change-overlay interaction as components/avatar/AvatarUpload, but a square-ish
// bordered box with object-contain instead of a circular crop — logos are rarely square, and a
// circular crop would clip most of them. Falls back to the bundled default logo.png (never blank
// initials, since an org has no "name" to initial the way a person's avatar does).
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
          <BrandLogo className="size-10" showWordmark={false} />
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
  const { data: settings, isPending } = useSettingsQuery();
  const mutation = useUpdateSettingsMutation();
  const uploadLogoMutation = useUploadLogoMutation();
  const removeLogoMutation = useRemoveLogoMutation();

  // Logo uploads immediately on file pick, same as AvatarUpload elsewhere — not gated behind the
  // form's own "Save changes" button, so kept as local state seeded from the query rather than an
  // RHF field. orgName stays a real form field below since it saves with everything else.
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
      reset({ ...settings, maintenanceMessage: settings.maintenanceMessage ?? '' });
      setLogoUrl(settings.logoUrl);
    }
  }, [settings, reset]);

  const onSubmit = (data: SettingsFields) =>
    mutation.mutate({ ...data, maintenanceMessage: data.maintenanceMessage.trim() || null });

  if (isPending) {
    return (
      <div className="flex flex-col gap-6 max-w-lg">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-xl shrink-0" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      <div className="flex items-center gap-3">
        <GradientIconTile icon={SettingsIcon} />
        <div>
          <h1 className="text-xl font-display font-bold text-text">Settings</h1>
          <p className="text-sm text-text-muted mt-0.5">
            System-wide defaults for ticket SLA and file uploads.
          </p>
        </div>
      </div>

      <Form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
        <div className="flex flex-col gap-4 p-4 rounded-xl border border-border">
          <div className="flex items-center gap-2">
            <Building2 size={14} className="text-text-muted" />
            <span className="text-xs font-display font-bold text-text-muted">Branding</span>
          </div>

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
          <p className="text-xs text-text-muted -mt-1">
            Shown in the header, footer, login screen, and as the sender name on emails.
          </p>
        </div>

        <Input
          id="defaultTatHours"
          label="Default ticket TAT (hours)"
          type="number"
          step="1"
          suffix={<span className="text-xs text-text-light">hours</span>}
          error={errors.defaultTatHours?.message}
          {...register('defaultTatHours', { valueAsNumber: true })}
        />

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

        <Controller
          control={control}
          name="allowedImageTypes"
          render={({ field }) => (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-display font-medium text-text-secondary">Allowed image types</span>
              <div className="flex gap-4">
                {IMAGE_TYPE_OPTIONS.map(opt => {
                  const checked = field.value?.includes(opt.value) ?? false;
                  return (
                  <label key={opt.value} className="flex items-center gap-1.5 text-sm text-text font-display cursor-pointer">
                    {/* sr-only, not hidden — `hidden` is display:none, which drops the checkbox out
                        of the tab order entirely, making this control unreachable by keyboard.
                        sr-only keeps it focusable/toggleable while the styled box below stands in
                        visually; `peer` + `peer-focus-visible:` puts the focus ring on that box. */}
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={checked}
                      onChange={e => {
                        const next = e.target.checked
                          ? [...(field.value ?? []), opt.value]
                          : (field.value ?? []).filter((v: string) => v !== opt.value);
                        field.onChange(next);
                      }}
                    />
                    <div className={`flex items-center justify-center size-4 rounded border transition-colors peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/50 peer-focus-visible:ring-offset-1 ${checked ? 'bg-primary-500 border-primary-500' : 'bg-surface border-border'}`}>
                      {checked && <CheckSquare size={11} className="text-white" />}
                    </div>
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

        <div className="flex flex-col gap-3 p-4 rounded-xl border border-border">
          <Controller
            control={control}
            name="maintenanceMode"
            render={({ field }) => (
              <SwitchRow
                id="maintenanceMode"
                icon={Construction}
                iconClassName="text-warning"
                label="Maintenance mode"
                description="Takes the app down for everyone except admins."
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
        </div>

        <div className="flex flex-col gap-4 p-4 rounded-xl border border-border">
          <div className="flex items-center gap-2">
            <Bell size={14} className="text-text-muted" />
            <span className="text-xs font-display font-bold text-text-muted">Notification defaults</span>
          </div>

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
        </div>

        <div className="flex flex-col gap-4 p-4 rounded-xl border border-border">
          <div className="flex items-center gap-2">
            <KeyRound size={14} className="text-text-muted" />
            <span className="text-xs font-display font-bold text-text-muted">Session &amp; tokens</span>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
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
          <p className="text-xs text-text-muted -mt-1">
            The app silently renews itself every access-token window, so people won't notice it — it
            mainly controls how often that happens. "Stay signed in for" is the one that matters day
            to day: how long someone can close the app and come back without logging in again.
            Only applies going forward — already-open sessions keep their current timing until they
            next refresh.
          </p>
        </div>

        <div className="flex flex-col gap-4 p-4 rounded-xl border border-border">
          <div className="flex items-center gap-2">
            <Database size={14} className="text-text-muted" />
            <span className="text-xs font-display font-bold text-text-muted">Data retention</span>
          </div>

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
          <p className="text-xs text-text-muted -mt-1">
            How long each type of record is kept before a nightly sweep deletes it. Set any of these
            to 0 to keep that record forever — the right choice if you have a compliance requirement
            to retain audit history indefinitely.
          </p>
        </div>

        {mutation.isError && (
          <p className="text-xs text-danger text-center">
            {mutation.error instanceof Error ? mutation.error.message : 'Failed to save settings.'}
          </p>
        )}

        <div className="flex justify-end pt-1">
          <Button type="submit" variant="primary" size="sm" isLoading={mutation.isPending} disabled={!isDirty}>
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Save changes
          </Button>
        </div>
      </Form>
    </div>
  );
};
