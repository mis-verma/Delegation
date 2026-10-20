import { useCallback, useEffect, useRef, useState } from 'react';

export const UNDO_WINDOW_MS = 6000;
const SAVED_TICK_MS = 2200;

export const useUndoableAnswer = <T,>(save: (value: T) => void, done: boolean) => {
  const [queued, setQueued] = useState<T | null>(null);
  const [saved, setSaved] = useState(false);
  const queuedRef = useRef<T | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awaitingRef = useRef(false);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    queuedRef.current = null;
    setQueued(null);
  }, []);

  const flush = useCallback(() => {
    const value = queuedRef.current;
    if (value === null) return;
    clear();
    awaitingRef.current = true;
    saveRef.current(value);
  }, [clear]);

  const queue = useCallback((value: T) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    queuedRef.current = value;
    setQueued(value);
    setSaved(false);
    timerRef.current = setTimeout(flush, UNDO_WINDOW_MS);
  }, [flush]);

  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  useEffect(() => {
    if (!done || !awaitingRef.current) return undefined;
    awaitingRef.current = false;
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), SAVED_TICK_MS);
    return () => clearTimeout(timer);
  }, [done]);

  return { queued, saved, queue, undo: clear, clear };
};
