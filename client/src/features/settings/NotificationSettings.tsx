import { useEffect, useState } from 'react';
import { BellRing, MoonStar, Sunrise } from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SettingsCard } from './SettingsCard';
import { Switch } from '../../components/switch';
import { TimePicker } from '../../components/timePicker';
import { InlineError } from '../../components/inlineError';
import { Skeleton } from '../../components/skeleton';
import { notificationApi, type NotificationPrefs } from '../../api/notifications';
import { disablePush, enablePush, isPushOnThisDevice, pushSupported } from '../../lib/push';
import { handleQueryRetry, notifyError } from '../../lib/queryHelpers';

const PUSH_KEY = ['notifications', 'push-status'] as const;
const PREFS_KEY = ['notifications', 'preferences'] as const;

const DENIED_HELP = 'Notifications are blocked for this site. Allow them in your browser or phone settings, then try again.';

export const NotificationSettings = () => {
  const queryClient = useQueryClient();
  const [onThisDevice, setOnThisDevice] = useState(false);
  const [busy, setBusy] = useState(false);
  const supported = pushSupported();

  const status = useQuery({ queryKey: PUSH_KEY, queryFn: () => notificationApi.pushStatus().then((r) => r.data), retry: handleQueryRetry });
  const prefs = useQuery({ queryKey: PREFS_KEY, queryFn: () => notificationApi.getPreferences().then((r) => r.data), retry: handleQueryRetry });

  useEffect(() => {
    void isPushOnThisDevice().then(setOnThisDevice);
  }, [status.data?.devices]);

  const save = useMutation({
    mutationFn: (next: NotificationPrefs) => notificationApi.savePreferences(next).then((r) => r.data),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: PREFS_KEY });
      const previous = queryClient.getQueryData<NotificationPrefs>(PREFS_KEY);
      queryClient.setQueryData(PREFS_KEY, next);
      return { previous };
    },
    onError: (err, _next, context) => {
      if (context?.previous) queryClient.setQueryData(PREFS_KEY, context.previous);
      notifyError(err, "Couldn't save that. Try again.");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: PREFS_KEY }),
  });

  const togglePush = async (on: boolean) => {
    setBusy(true);
    try {
      if (on) {
        const result = await enablePush(status.data?.publicKey ?? null);
        if (result === 'ok') { setOnThisDevice(true); toast.success('Notifications are on for this device'); }
        else if (result === 'denied') toast.error(DENIED_HELP);
        else if (result === 'not-configured') toast.error('Push is not switched on for this server yet. Ask an admin.');
        else toast.error("This browser can't receive push notifications. On iPhone, add KaryaOS to the Home Screen first.");
      } else {
        await disablePush();
        setOnThisDevice(false);
        toast.success('Notifications are off for this device');
      }
      await queryClient.invalidateQueries({ queryKey: PUSH_KEY });
    } catch (err) {
      notifyError(err, "Couldn't change that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const p = prefs.data;
  const update = (patch: Partial<NotificationPrefs>) => { if (p) save.mutate({ ...p, ...patch }); };
  const quietOn = !!p?.quietStart && !!p?.quietEnd;
  const serverReady = status.data?.configured ?? false;
  const pushDisabled = busy || !supported || status.isPending || !serverReady;

  return (
    <>
      <SettingsCard
        icon={BellRing}
        title="Phone notifications"
        hint={
          !supported
            ? "This browser can't receive push notifications. On an iPhone, add KaryaOS to the Home Screen first, then open it from there."
            : !serverReady && !status.isPending
              ? 'Push is not switched on for this server yet. An admin needs to finish the setup.'
              : 'A message on your lock screen when something needs you, and a count on the app icon. Your other devices are not affected.'
        }
      >
        {status.isError ? (
          <InlineError message="Couldn't check notification settings." onRetry={() => void status.refetch()} />
        ) : (
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="push-switch" className="t-card font-display font-semibold text-text">
              Notify me on this device
            </label>
            <Switch id="push-switch" checked={onThisDevice} disabled={pushDisabled} onChange={(on) => void togglePush(on)} />
          </div>
        )}
      </SettingsCard>

      <SettingsCard
        icon={MoonStar}
        title="Quiet hours"
        hint="No lock-screen messages in this window. Overdue and escalation alerts still come through, and everything still shows inside the app."
      >
        {prefs.isPending ? (
          <Skeleton className="h-11 w-full rounded-xl" />
        ) : prefs.isError ? (
          <InlineError message="Couldn't load your preferences." onRetry={() => void prefs.refetch()} />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="quiet-switch" className="t-card font-display font-semibold text-text">Mute at night</label>
              <Switch
                id="quiet-switch"
                checked={quietOn}
                onChange={(on) => update(on ? { quietStart: '21:00', quietEnd: '08:00' } : { quietStart: null, quietEnd: null })}
              />
            </div>
            {quietOn && (
              <div className="grid grid-cols-2 gap-3">
                <TimePicker prefix="From" value={p?.quietStart ?? ''} onChange={(v) => update({ quietStart: v })} popover />
                <TimePicker prefix="Until" value={p?.quietEnd ?? ''} onChange={(v) => update({ quietEnd: v })} popover />
              </div>
            )}
          </div>
        )}
      </SettingsCard>

      <SettingsCard
        icon={Sunrise}
        title="Morning summary"
        hint="One message at 9 AM saying how many updates are waiting, only on days you have some."
      >
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="digest-switch" className="t-card font-display font-semibold text-text">Send me a morning summary</label>
          <Switch id="digest-switch" checked={p?.morningDigest ?? false} disabled={!p || !serverReady} onChange={(on) => update({ morningDigest: on })} />
        </div>
      </SettingsCard>
    </>
  );
};
