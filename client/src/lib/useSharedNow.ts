import { useSyncExternalStore } from 'react';

let current = Date.now();
let timer: number | undefined;
const listeners = new Set<() => void>();

const tick = () => {
  current = Date.now();
  listeners.forEach((l) => l());
};

const subscribe = (listener: () => void) => {
  if (listeners.size === 0) {
    current = Date.now();
    timer = window.setInterval(tick, 60_000);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.clearInterval(timer);
  };
};

const getSnapshot = () => current;

export const useSharedNow = (): number => useSyncExternalStore(subscribe, getSnapshot);
