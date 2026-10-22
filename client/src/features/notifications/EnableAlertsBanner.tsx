import { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { notificationApi } from '../../api/notifications';
import { enablePush, isPushOnThisDevice, pushSupported } from '../../lib/push';
import { handleQueryRetry } from '../../lib/queryHelpers';

const PUSH_KEY = ['notifications', 'push-status'] as const;
const DISMISS_KEY = 'tm-alerts-prompt-dismissed-at';
const DISMISS_DAYS = 7;

const recentlyDismissed = () => {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60_000;
  } catch {
    return false;
  }
};

export const EnableAlertsBanner = () => {
  const queryClient = useQueryClient();
  const { isPreviewing } = useAuth();
  const [onDevice, setOnDevice] = useState<boolean | null>(null);
  const [hidden, setHidden] = useState(recentlyDismissed);
  const [busy, setBusy] = useState(false);
  const status = useQuery({ queryKey: PUSH_KEY, queryFn: () => notificationApi.pushStatus().then((r) => r.data), retry: handleQueryRetry });

  useEffect(() => {
    void isPushOnThisDevice().then(setOnDevice);
  }, [status.data?.devices]);

  const blocked = typeof Notification !== 'undefined' && Notification.permission === 'denied';
  if (isPreviewing || hidden || onDevice !== false || blocked || !pushSupported() || !status.data?.configured) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { void 0; }
    setHidden(true);
  };

  const turnOn = async () => {
    setBusy(true);
    try {
      const result = await enablePush(status.data?.publicKey ?? null);
      if (result === 'ok') {
        setOnDevice(true);
        toast.success('Alerts are on. You will see them like WhatsApp messages.');
        await queryClient.invalidateQueries({ queryKey: PUSH_KEY });
      } else if (result === 'denied') {
        toast.error('Alerts are blocked. Allow notifications for this site in your phone settings, then try again.');
      } else {
        toast.error("This browser can't show alerts. On iPhone, add KaryaOS to the Home Screen first.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="region" aria-label="Turn on alerts" className="flex items-center gap-3 rounded-xl border border-primary-500/30 bg-primary-500/8 p-3 sm:p-3.5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-primary-500 to-primary-700 text-white" aria-hidden="true">
        <BellRing size={18} strokeWidth={2.25} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="t-card font-display font-bold text-text">Get alerts on your phone</p>
        <p className="t-meta font-display text-text-muted">Tickets, delegations and checklists that are due show up on your screen, even when the app is closed.</p>
      </div>
      <Button size="sm" onClick={() => void turnOn()} isLoading={busy} className="shrink-0 pointer-coarse:h-11">Turn on</Button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Not now"
        className="flex size-9 pointer-coarse:size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-muted outline-none transition-colors duration-150 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
};
