import { toast } from 'sonner';

export const registerServiceWorker = () => {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        navigator.serviceWorker.addEventListener('message', (event) => {
          const data = event.data as { type?: string; url?: string } | undefined;
          if (data?.type === 'OPEN_URL' && data.url) window.location.assign(data.url);
        });
        const offerRefresh = (worker: ServiceWorker) => {
          toast('A new version of KaryaOS is ready', {
            id: 'app-update',
            duration: Infinity,
            action: { label: 'Refresh', onClick: () => worker.postMessage('SKIP_WAITING') },
          });
        };

        if (registration.waiting && navigator.serviceWorker.controller) offerRefresh(registration.waiting);

        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) offerRefresh(worker);
          });
        });

        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void registration.update().catch(() => undefined);
        });
      })
      .catch(() => undefined);

    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
};
