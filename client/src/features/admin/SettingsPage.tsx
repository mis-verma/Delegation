import { useEffect, type ReactNode } from 'react';
import { useSearchParams, useBlocker } from 'react-router';
import { useForm, FormProvider, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Settings as SettingsIcon, Building2, Upload, Bell, KeyRound, Database, Construction, CircleDot, type LucideIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button, Skeleton, PageHeader, InlineError, SlidingTabs, IconChip, StateChip, useConfirm } from '../../components';
import { useSettingsQuery, useUpdateSettingsMutation } from './hook';
import { settingsSchema, FIELD_SECTION, type SettingsFields, type SectionKey } from './settings/schema';
import { GeneralSection, TicketsSection, NotificationsSection, SecuritySection, SystemSection } from './settings/sections';

interface SectionDef {
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  render: (isAdmin: boolean) => ReactNode;
}

const SECTIONS: Record<SectionKey, SectionDef> = {
  general: { label: 'General', icon: Building2, render: () => <GeneralSection /> },
  tickets: { label: 'Tickets', icon: Upload, render: (isAdmin) => <TicketsSection isAdmin={isAdmin} /> },
  notifications: { label: 'Notifications', icon: Bell, render: (isAdmin) => <NotificationsSection isAdmin={isAdmin} /> },
  security: { label: 'Security', icon: KeyRound, adminOnly: true, render: () => <SecuritySection /> },
  system: { label: 'Data and maintenance', icon: Database, adminOnly: true, render: () => <SystemSection /> },
};

const SECTION_KEYS = Object.keys(SECTIONS) as SectionKey[];

const SUBTITLE = 'Branding, defaults, notifications, sessions and retention. These apply to everyone.';

const toFormValues = (settings: NonNullable<ReturnType<typeof useSettingsQuery>['data']>) => ({
  ...settings,
  maintenanceMessage: settings.maintenanceMessage ?? '',
  androidAppUrl: settings.androidAppUrl ?? '',
  iosAppUrl: settings.iosAppUrl ?? '',
});

type SavedSettings = NonNullable<ReturnType<typeof useSettingsQuery>['data']>;

const SettingsGlance = ({ settings, isAdmin }: { settings: SavedSettings; isAdmin: boolean }) => (
  <div role="list" aria-label="Settings at a glance" className="flex flex-wrap items-center gap-2">
    {isAdmin && (
      <span role="listitem">
        {settings.maintenanceMode
          ? <IconChip icon={Construction} tone="bg-warning" label="Maintenance on" labelClassName="text-warning" />
          : <StateChip active label="App is live" />}
      </span>
    )}
    {isAdmin && <span role="listitem"><StateChip active={settings.requireAdminLoginCode} label={settings.requireAdminLoginCode ? 'Admin email code on' : 'Admin email code off'} /></span>}
    <span role="listitem"><StateChip active={settings.notifyChecklistOverdueReminders} label={settings.notifyChecklistOverdueReminders ? 'Checklist reminders on' : 'Checklist reminders off'} /></span>
    <span role="listitem"><StateChip active={settings.notifyTaskDeadlineReminders} label={settings.notifyTaskDeadlineReminders ? 'Delegation reminders on' : 'Delegation reminders off'} /></span>
  </div>
);

const PageTop = () => <PageHeader icon={SettingsIcon} title="Settings" subtitle={SUBTITLE} />;

export const SettingsPage = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const { data: settings, isPending, isError, refetch } = useSettingsQuery();
  const confirm = useConfirm();
  const mutation = useUpdateSettingsMutation();
  const [searchParams, setSearchParams] = useSearchParams();

  const visibleKeys = SECTION_KEYS.filter((key) => isAdmin || !SECTIONS[key].adminOnly);
  const requested = searchParams.get('section');
  const active = visibleKeys.find((key) => key === requested) ?? visibleKeys[0];

  const selectSection = (key: SectionKey) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('section', key);
        return next;
      },
      { replace: true },
    );
  };

  const methods = useForm<SettingsFields>({ resolver: zodResolver(settingsSchema) });
  const {
    handleSubmit,
    reset,
    formState: { isDirty },
  } = methods;

  useEffect(() => {
    if (settings) reset(toFormValues(settings), { keepDirtyValues: true });
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

  const onSubmit = (data: SettingsFields) => {
    const androidAppUrl = data.androidAppUrl.trim() || null;
    const iosAppUrl = data.iosAppUrl.trim() || null;
    if (isAdmin) {
      mutation.mutate(
        { ...data, maintenanceMessage: data.maintenanceMessage.trim() || null, androidAppUrl, iosAppUrl },
        { onSuccess: () => methods.setValue('loginCodeProof', undefined) },
      );
      return;
    }
    mutation.mutate({
      orgName: data.orgName,
      defaultTatHours: data.defaultTatHours,
      notifyTaskDeadlineReminders: data.notifyTaskDeadlineReminders,
      notifyChecklistOverdueReminders: data.notifyChecklistOverdueReminders,
      androidAppUrl,
      iosAppUrl,
    });
  };

  const onInvalid = (errors: FieldErrors<SettingsFields>) => {
    const firstField = (Object.keys(errors) as (keyof SettingsFields)[]).find((name) => visibleKeys.includes(FIELD_SECTION[name]));
    if (firstField) selectSection(FIELD_SECTION[firstField]);
  };

  if (isError && !settings) {
    return (
      <div className="flex flex-col gap-5 w-full">
        <PageTop />
        <InlineError message="We couldn't load the settings. Check your connection and try again." onRetry={() => void refetch()} />
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
        <Skeleton className="h-11 w-full sm:w-96 rounded-xl" />
        <div className="flex flex-col gap-5 max-w-3xl">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 sm:gap-6 w-full">
      <PageTop />
      {settings && <SettingsGlance settings={settings} isAdmin={isAdmin} />}

      <SlidingTabs
        label="Settings sections"
        value={active}
        onChange={selectSection}
        options={visibleKeys.map((key) => ({ value: key, label: SECTIONS[key].label, icon: SECTIONS[key].icon }))}
        fill="phone"
      />

      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="flex flex-col gap-5 w-full" noValidate>
          {SECTION_KEYS.map((key) => (
            <div key={key} role="tabpanel" hidden={key !== active} className="flex flex-col gap-5 w-full max-w-3xl">
              {SECTIONS[key].render(isAdmin)}
            </div>
          ))}

          {mutation.isError && (
            <p role="alert" className="text-sm text-danger text-center">
              {mutation.error instanceof Error ? mutation.error.message : "Couldn't save the settings. Check your connection and try again."}
            </p>
          )}

          {(isDirty || mutation.isPending) && (
            <div className="sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] md:bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary-500/30 bg-surface px-4 py-3">
              <IconChip icon={CircleDot} tone="bg-warning" label="Unsaved changes" />
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" disabled={mutation.isPending} onClick={() => settings && reset(toFormValues(settings))}>
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
      </FormProvider>
    </div>
  );
};
