import { toast } from 'sonner';

/**
 * Registers the service worker (public/sw.js) in a production build, and when a new version has downloaded, asks
 * the person to refresh instead of reloading under them mid-task. Dev builds skip it: a cached shell and Vite's hot
 * reload fight each other.
 */
export const registerServiceWorker = () => {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        const offerRefresh = (worker: ServiceWorker) => {
          toast('A new version of KaryaOS is ready', {
            id: 'app-update',
            duration: Infinity,
            action: { label: 'Refresh', onClick: () => worker.postMessage('SKIP_WAITING') },
          });
        };

        // An update that finished downloading while the app was closed.
        if (registration.waiting && navigator.serviceWorker.controller) offerRefresh(registration.waiting);

        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            // `controller` is set only when an older version is running: the very first install needs no prompt.
            if (worker.state === 'installed' && navigator.serviceWorker.controller) offerRefresh(worker);
          });
        });

        // Check for a new version when the app comes back to the front, not only on a full reload.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void registration.update().catch(() => undefined);
        });
      })
      .catch(() => undefined);

    // The new version took over (after Refresh): reload once so the page runs its files.
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
};
