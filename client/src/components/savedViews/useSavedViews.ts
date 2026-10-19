import { useCallback, useState } from 'react';

export interface SavedView<T> {
  id: string;
  name: string;
  state: T;
  savedAt: number;
}

const MAX_SAVED_VIEWS = 12;
export const SAVED_VIEW_NAME_MAX = 40;

const read = <T,>(storageKey: string): SavedView<T>[] => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as SavedView<T>[]).filter((v) => v && typeof v.id === 'string' && typeof v.name === 'string') : [];
  } catch {
    return [];
  }
};

const write = <T,>(storageKey: string, views: SavedView<T>[]) => {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(views));
  } catch {
  }
};

export const useSavedViews = <T,>(storageKey: string) => {
  const [views, setViews] = useState<SavedView<T>[]>(() => read<T>(storageKey));

  const save = useCallback((name: string, state: T) => {
    const clean = name.trim().slice(0, SAVED_VIEW_NAME_MAX);
    if (!clean) return;
    setViews((prev) => {
      const without = prev.filter((v) => v.name.toLowerCase() !== clean.toLowerCase());
      const next = [{ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: clean, state, savedAt: Date.now() }, ...without].slice(0, MAX_SAVED_VIEWS);
      write(storageKey, next);
      return next;
    });
  }, [storageKey]);

  const remove = useCallback((id: string) => {
    setViews((prev) => {
      const next = prev.filter((v) => v.id !== id);
      write(storageKey, next);
      return next;
    });
  }, [storageKey]);

  return { views, save, remove, isFull: views.length >= MAX_SAVED_VIEWS };
};
