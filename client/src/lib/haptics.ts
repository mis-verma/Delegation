import { useSyncExternalStore } from 'react';

// Short phone buzzes for taps, saves and failures. Only Android browsers implement
// navigator.vibrate (iPhone Safari does not), so everything here quietly does nothing elsewhere:
// no vibrate support, a mouse-and-keyboard device, reduced-motion on, or the person turned it off.

export type HapticKind = 'tap' | 'success' | 'warning' | 'error';

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  success: [12, 40, 12],
  warning: [30, 50, 30],
  error: [40, 60, 40, 60, 80],
};

// Higher beats lower when two buzzes land inside the throttle window (a failure right after a tap).
const PRIORITY: Record<HapticKind, number> = { tap: 0, success: 1, warning: 2, error: 3 };

const STORAGE_KEY = 'tm-haptics';
const CHANGE_EVENT = 'tm-haptics-change';
const THROTTLE_MS = 300;

export const hapticsSupported = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

const readEnabled = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
};

export const setHapticsEnabled = (enabled: boolean): void => {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    /* storage blocked: the change just won't persist */
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

/** The person's on/off choice and a setter, for the Settings switch. */
export const useHapticsEnabled = (): [boolean, (enabled: boolean) => void] => {
  const enabled = useSyncExternalStore(subscribe, readEnabled, () => true);
  return [enabled, setHapticsEnabled];
};

let lastAt = 0;
let lastKind: HapticKind = 'tap';

export const haptic = (kind: HapticKind): void => {
  try {
    if (!hapticsSupported() || !readEnabled()) return;
    if (!window.matchMedia('(pointer: coarse)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const now = Date.now();
    if (now - lastAt < THROTTLE_MS && PRIORITY[kind] <= PRIORITY[lastKind]) return;

    lastAt = now;
    lastKind = kind;
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    /* vibration is a nicety: never let it break an action */
  }
};

// Taps you can feel, everywhere: one listener for the whole app instead of a haptic() call in every button. A finger
// pressing a button, link, tab, menu item, switch or tappable card gives a tiny tick (the 'tap' pattern), the way a
// native app does. Touch only (a mouse click never buzzes), disabled controls stay silent, and everything haptic()
// already checks still applies (support, the Settings switch, reduced motion).
const TAPPABLE = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"], label, summary';

export const installTapHaptics = (): (() => void) => {
  // click, not pointerdown: a finger that lands on a card to scroll the page must not buzz; only a real tap clicks.
  const onClick = (e: MouseEvent) => {
    // Chrome reports which pointer made the click; a mouse or pen never buzzes. Older browsers leave it out, and
    // haptic() itself still requires a touch screen.
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
