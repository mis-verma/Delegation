import { useState, type ComponentProps, type ReactNode } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { CheckSquare, Construction, Bell, Clock, ListChecks, KeyRound, Camera, Building2, Database, Upload, Smartphone } from 'lucide-react';
import { Input, Textarea } from '../../../components';
import { useSettingsQuery, useUploadLogoMutation, useRemoveLogoMutation } from '../hook';
import { resolveLogoUrl } from '../../../lib/uploadsBase';
import { SettingsCard } from '../../settings/SettingsCard';
import { LogoUpload } from './LogoUpload';
import { SwitchRow } from './SwitchRow';
import { IMAGE_TYPE_OPTIONS, type SettingsFields } from './schema';

type NumericField =
  | 'defaultTatHours'
  | 'maxUploadSizeMb'
  | 'maxUploadFiles'
  | 'autoCloseDays'
  | 'accessTokenExpiresMinutes'
  | 'refreshTokenExpiresDays'
  | 'auditRetentionDays'
  | 'checklistAuditRetentionDays'
  | 'notificationRetentionDays'
  | 'inboundMessageRetentionDays';

type SwitchField = 'notifyTaskDeadlineReminders' | 'notifyChecklistOverdueReminders' | 'liveOnlyAttachments' | 'requireAdminLoginCode' | 'maintenanceMode';

interface AdminOnlyProps {
  show: boolean;
  children: ReactNode;
}

export const AdminOnly = ({ show, children }: AdminOnlyProps) => <div className={show ? 'contents' : 'hidden'}>{children}</div>;

interface SectionProps {
  isAdmin: boolean;
}

const NumberField = ({ name, label, suffix }: { name: NumericField; label: string; suffix?: string }) => {
  const { register, formState: { errors } } = useFormContext<SettingsFields>();
  return (
    <Input
      id={name}
      label={label}
      type="number"
      step="1"
      suffix={suffix ? <span className="t-meta text-text-light">{suffix}</span> : undefined}
      error={errors[name]?.message}
      {...register(name, { valueAsNumber: true })}
    />
  );
};

interface SwitchFieldProps extends Omit<ComponentProps<typeof SwitchRow>, 'id' | 'checked' | 'onChange'> {
  name: SwitchField;
}

const SwitchFieldRow = ({ name, ...rest }: SwitchFieldProps) => {
  const { control } = useFormContext<SettingsFields>();
  return <Controller control={control} name={name} render={({ field }) => <SwitchRow {...rest} id={name} checked={field.value} onChange={field.onChange} />} />;
};

const Divider = () => <div className="h-px w-full bg-border" />;

const TwoColumns = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;

export const GeneralSection = () => {
  const { register, formState: { errors } } = useFormContext<SettingsFields>();
  const { data: settings } = useSettingsQuery();
  const uploadLogoMutation = useUploadLogoMutation();
  const removeLogoMutation = useRemoveLogoMutation();
  const [logoOverride, setLogoOverride] = useState<string | null | undefined>(undefined);
  const logoUrl = logoOverride === undefined ? (settings?.logoUrl ?? null) : logoOverride;

  return (
    <>
      <SettingsCard icon={Building2} title="Branding" hint="Shown in the header, footer, login screen, and as the sender name on emails.">
        <LogoUpload
          src={resolveLogoUrl(logoUrl)}
          isUploading={uploadLogoMutation.isPending}
          isRemoving={removeLogoMutation.isPending}
          onUpload={(file) => uploadLogoMutation.mutate(file, { onSuccess: (updated) => setLogoOverride(updated.logoUrl) })}
          onRemove={() => removeLogoMutation.mutate(undefined, { onSuccess: (updated) => setLogoOverride(updated.logoUrl) })}
        />
        <Input id="orgName" label="Organization name" placeholder="Karya" error={errors.orgName?.message} {...register('orgName')} />
      </SettingsCard>

      <SettingsCard icon={Smartphone} title="Mobile app" hint="Shown on everyone's profile under Get the app, and on the page people open from the app link. Leave a box empty to hide that button.">
        <Input id="androidAppUrl" label="Android app download link" placeholder="https://..." inputMode="url" error={errors.androidAppUrl?.message} {...register('androidAppUrl')} />
        <Input id="iosAppUrl" label="iPhone App Store link" placeholder="https://apps.apple.com/..." inputMode="url" error={errors.iosAppUrl?.message} {...register('iosAppUrl')} />
      </SettingsCard>

    </>
  );
};

export const TicketsSection = ({ isAdmin }: SectionProps) => {
  const { control, formState: { errors } } = useFormContext<SettingsFields>();
  return (
    <SettingsCard icon={Upload} title="Tickets and uploads" hint="The default due time for a new ticket, and the limits on what people can attach.">
      <NumberField name="defaultTatHours" label="Default ticket TAT (hours)" suffix="hours" />

      <AdminOnly show={isAdmin}>
        <TwoColumns>
          <NumberField name="maxUploadSizeMb" label="Max upload size per file" suffix="MB" />
          <NumberField name="maxUploadFiles" label="Max files per upload" />
        </TwoColumns>

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
                          const next = e.target.checked ? [...(field.value ?? []), opt.value] : (field.value ?? []).filter((v: string) => v !== opt.value);
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
              {errors.allowedImageTypes && <span className="t-meta font-medium text-danger">{errors.allowedImageTypes.message}</span>}
            </div>
          )}
        />

        <NumberField name="autoCloseDays" label="Close waiting approvals after" suffix="days" />
        <p className="t-meta text-text-muted">A ticket or delegation that was handed in and nobody approved closes by itself after this many days. Set 0 to turn it off.</p>
      </AdminOnly>
    </SettingsCard>
  );
};

export const NotificationsSection = ({ isAdmin }: SectionProps) => (
  <SettingsCard icon={Bell} title="Notification defaults">
    <SwitchFieldRow name="notifyTaskDeadlineReminders" icon={Clock} label="Delegation deadline reminders" description="Notify assignees as a delegation's due date approaches." />
    <AdminOnly show={isAdmin}>
      <Divider />
      <SwitchFieldRow
        name="liveOnlyAttachments"
        icon={Camera}
        label="Live camera only for ticket photos"
        description="Ticket and delegation photos must be taken with the camera. The Gallery button is hidden."
      />
    </AdminOnly>
    <Divider />
    <SwitchFieldRow name="notifyChecklistOverdueReminders" icon={ListChecks} label="Checklist overdue reminders" description="Notify assignees and store PCs when a checklist runs past its deadline." />
  </SettingsCard>
);

export const SecuritySection = () => {
  const { control } = useFormContext<SettingsFields>();
  const { data: settings } = useSettingsQuery();
  const emailConfigured = Boolean(settings?.emailConfigured);
  const requireCode = useWatch({ control, name: 'requireAdminLoginCode' });
  return (
    <SettingsCard
      icon={KeyRound}
      title="Session and sign-in"
      hint={'The app silently renews itself every access-token window, so people won\'t notice it. "Stay signed in for" is the one that matters day to day: how long someone can close the app and come back without logging in again. It only applies going forward; already-open sessions keep their current timing until they next refresh.'}
    >
      <TwoColumns>
        <NumberField name="accessTokenExpiresMinutes" label="Access token lifetime" suffix="min" />
        <NumberField name="refreshTokenExpiresDays" label="Stay signed in for" suffix="days" />
      </TwoColumns>
      <Divider />
      <SwitchFieldRow
        name="requireAdminLoginCode"
        icon={KeyRound}
        label="Email code for Admin sign-in"
        description={emailConfigured ? 'Admins enter a 6-digit code from their email after the password. A device can be trusted for 30 days.' : 'Email is not set up on the server, so codes cannot be sent. Add the mail settings first.'}
        disabled={!emailConfigured && !requireCode}
      />
    </SettingsCard>
  );
};

export const SystemSection = () => {
  const { register, control, formState: { errors } } = useFormContext<SettingsFields>();
  const maintenanceMode = useWatch({ control, name: 'maintenanceMode' });
  return (
    <>
      <SettingsCard
        icon={Database}
        title="Data retention"
        hint="How long each type of record is kept before a nightly sweep deletes it. Set any of these to 0 to keep that record forever, the right choice if you must retain audit history indefinitely."
      >
        <TwoColumns>
          <NumberField name="auditRetentionDays" label="Audit log" suffix="days" />
          <NumberField name="checklistAuditRetentionDays" label="Checklist answer history" suffix="days" />
          <NumberField name="notificationRetentionDays" label="Notifications" suffix="days" />
          <NumberField name="inboundMessageRetentionDays" label="Inbound messages" suffix="days" />
        </TwoColumns>
      </SettingsCard>

      <SettingsCard icon={Construction} title="Maintenance" tone="warning">
        <SwitchFieldRow name="maintenanceMode" icon={Construction} iconClassName="text-warning" label="Maintenance mode" description="Takes the app down for everyone except admins and PC." />
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
    </>
  );
};
