import { toast } from 'sonner';
import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export const listenForInstallPrompt = () => {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    notify();
  });
};

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

const isAndroid = () => typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

const snapshot = () => (deferred ? 1 : 0) + (installed ? 2 : 0);

export const useInstallPrompt = () => {
  useSyncExternalStore(subscribe, snapshot, () => 0);
  return {
    canInstall: !!deferred,
    installed: installed || isStandalone(),
    ios: isIos(),
    android: isAndroid(),
    install: async () => {
      if (!deferred) return false;
      const event = deferred;
      await event.prompt();
      const { outcome } = await event.userChoice;
      deferred = null;
      if (outcome === 'accepted') installed = true;
      notify();
      return outcome === 'accepted';
    },
  };
};

export const getAppLink = () => `${window.location.origin}/get-app`;

export const shareAppLink = async () => {
  const url = getAppLink();
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Get the KaryaOS app', url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success('App link copied');
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    toast.error("Couldn't share the link. Copy it from the address bar instead.");
  }
};
