import { useEffect, useRef, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { toast } from 'sonner';

const isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine);

/**
 * A thin bar at the top of every screen while the device has no connection, so nobody taps Save and wonders why
 * nothing happened. Coming back online says so once, and React Query refetches by itself at that moment.
 */
export const OfflineBanner = () => {
  const [online, setOnline] = useState(isOnline);
  const wasOffline = useRef(!isOnline());

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      if (wasOffline.current) toast.success("You're back online", { id: 'connection' });
      wasOffline.current = false;
    };
    const goOffline = () => {
      setOnline(false);
      wasOffline.current = true;
      toast.dismiss('connection');
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-danger px-4 pt-[max(0.375rem,env(safe-area-inset-top))] pb-1.5 text-white t-meta font-display font-semibold"
    >
      <WifiOff size={14} strokeWidth={2.5} aria-hidden="true" />
      You're offline. Changes won't save yet.
    </div>
  );
};
