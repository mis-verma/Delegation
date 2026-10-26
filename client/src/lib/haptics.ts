import { useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export type HapticKind = 'tap' | 'success' | 'warning' | 'error';

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  success: [12, 40, 12],
  warning: [30, 50, 30],
  error: [40, 60, 40, 60, 80],
};

const PRIORITY: Record<HapticKind, number> = { tap: 0, success: 1, warning: 2, error: 3 };

const STORAGE_KEY = 'tm-haptics';
const CHANGE_EVENT = 'tm-haptics-change';
const THROTTLE_MS = 300;

const isNativeApp = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

export const hapticsSupported = (): boolean =>
  isNativeApp() || (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function');

const playNative = (kind: HapticKind): Promise<void> => {
  if (kind === 'tap') return Haptics.impact({ style: ImpactStyle.Light });
  if (kind === 'success') return Haptics.notification({ type: NotificationType.Success });
  if (kind === 'warning') return Haptics.notification({ type: NotificationType.Warning });
  return Haptics.notification({ type: NotificationType.Error });
};

const readEnabled = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
};

const setHapticsEnabled = (enabled: boolean): void => {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

const subscribe = (cb: () => void) => {
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener('storage', cb);
  };
};

export const useHapticsEnabled = (): [boolean, (enabled: boolean) => void] => {
  const enabled = useSyncExternalStore(subscribe, readEnabled, () => true);
  return [enabled, setHapticsEnabled];
};

let lastAt = 0;
let lastKind: HapticKind = 'tap';

export const haptic = (kind: HapticKind): void => {
  try {
    if (!hapticsSupported() || !readEnabled()) return;
    const native = isNativeApp();
    if (!native && !window.matchMedia('(pointer: coarse)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const now = Date.now();
    if (now - lastAt < THROTTLE_MS && PRIORITY[kind] <= PRIORITY[lastKind]) return;

    lastAt = now;
    lastKind = kind;
    if (native) {
      playNative(kind).catch(() => undefined);
      return;
    }
    navigator.vibrate(PATTERNS[kind]);
  } catch {
  }
};

const TAPPABLE = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"], label, summary';

export const installTapHaptics = (): (() => void) => {
  const onClick = (e: MouseEvent) => {
    const pointerType = (e as PointerEvent).pointerType;
    if (pointerType && pointerType !== 'touch') return;
    const target = e.target instanceof Element ? e.target.closest(TAPPABLE) : null;
    if (!target) return;
    if (target.matches(':disabled, [aria-disabled="true"]')) return;
    haptic('tap');
  };
  document.addEventListener('click', onClick, { capture: true, passive: true });
  return () => document.removeEventListener('click', onClick, { capture: true });
};
