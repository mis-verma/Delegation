import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const read = (key: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
};

export const useWatchedPeople = () => {
  const { user } = useAuth();
  const key = `tm-watched-people-${user?.id ?? 'anon'}`;
  const [ids, setIds] = useState<string[]>(() => read(key));

  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        void 0;
      }
      return next;
    });
  }, [key]);

  const watched = useMemo(() => new Set(ids), [ids]);
  return { watched, toggle };
};
