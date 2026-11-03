import { useCallback, useEffect, useRef } from 'react';

const HOLD_MS = 1500;

export const useRowActivity = (rowId: (id: string) => string) => {
  const last = useRef<{ row: string; at: number } | null>(null);
  const rowIdRef = useRef(rowId);

  useEffect(() => {
    rowIdRef.current = rowId;
  }, [rowId]);

  useEffect(() => {
    const note = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      const row = target?.closest('[data-row-id]')?.getAttribute('data-row-id');
      if (row) last.current = { row, at: Date.now() };
    };
    const events = ['pointerdown', 'touchstart', 'keydown', 'input', 'change'] as const;
    for (const name of events) document.addEventListener(name, note, true);
    return () => {
      for (const name of events) document.removeEventListener(name, note, true);
    };
  }, []);

  return useCallback((id: string) => {
    const element = document.getElementById(rowIdRef.current(id));
    if (element?.contains(document.activeElement)) return true;
    const touched = last.current;
    return !!touched && touched.row === id && Date.now() - touched.at < HOLD_MS;
  }, []);
};
