import { notificationApi } from '../api/notifications';

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const toKey = (base64: string) => {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const currentSubscription = async () => {
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
};

export const isPushOnThisDevice = async () => {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  return !!(await currentSubscription());
};

export type EnablePushResult = 'ok' | 'denied' | 'unsupported' | 'not-configured' | 'no-worker';

export const enablePush = async (publicKey: string | null): Promise<EnablePushResult> => {
  if (!pushSupported()) return 'unsupported';
  if (!publicKey) return 'not-configured';
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return 'no-worker';
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) }));
  await notificationApi.pushSubscribe(subscription.toJSON());
  return 'ok';
};

export const disablePush = async () => {
  const subscription = await currentSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe().catch(() => false);
  await notificationApi.pushUnsubscribe(endpoint).catch(() => undefined);
};

export const setAppBadge = (count: number) => {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  if (count > 0) void nav.setAppBadge?.(count).catch(() => undefined);
  else void nav.clearAppBadge?.().catch(() => undefined);
};
