import { useCallback, useState } from 'react';

const read = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  try {
    const saved = window.localStorage.getItem(key);
    return saved && (allowed as readonly string[]).includes(saved) ? (saved as T) : fallback;
  } catch {
    return fallback;
  }
};

export const useStoredChoice = <T extends string>(key: string, allowed: readonly T[], fallback: T) => {
  const [value, setValue] = useState<T>(() => read(key, allowed, fallback));
  const choose = useCallback((next: T) => {
    setValue(next);
    try {
      window.localStorage.setItem(key, next);
    } catch {
      return;
    }
  }, [key]);
  return [value, choose] as const;
};
