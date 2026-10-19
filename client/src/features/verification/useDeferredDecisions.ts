import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { notifyError } from '../../lib/queryHelpers';

const UNDO_WINDOW_MS = 10_000;

export interface DecisionRequest {
  id: string;
  verb: string;
  label: string;
  run: (options: { keepalive: boolean }) => Promise<unknown>;
}

interface Queued {
  request: DecisionRequest;
  timer: number;
  toastId: string | number;
}

interface Options {
  afterSaved?: () => Promise<unknown> | void;
  delayMs?: number;
}

export const useDeferredDecisions = ({ afterSaved, delayMs = UNDO_WINDOW_MS }: Options = {}) => {
  const [heldIds, setHeldIds] = useState<ReadonlySet<string>>(() => new Set());
  const queued = useRef(new Map<string, Queued>());
  const afterSavedRef = useRef(afterSaved);
  useEffect(() => { afterSavedRef.current = afterSaved; });

  const hold = useCallback((ids: string[]) => {
    setHeldIds((prev) => new Set([...prev, ...ids]));
  }, []);

  const release = useCallback((ids: string[]) => {
    setHeldIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  const fire = useCallback(async (id: string, keepalive: boolean) => {
    const entry = queued.current.get(id);
    if (!entry) return;
    queued.current.delete(id);
    window.clearTimeout(entry.timer);
    toast.dismiss(entry.toastId);
    try {
      await entry.request.run({ keepalive });
      try { await afterSavedRef.current?.(); } catch { }
    } catch (err) {
      notifyError(err, `Couldn't save that decision for ${entry.request.label}. It is back in the list.`);
    } finally {
      release([id]);
    }
  }, [release]);

  const undo = useCallback((id: string) => {
    const entry = queued.current.get(id);
    if (!entry) return;
    window.clearTimeout(entry.timer);
    queued.current.delete(id);
    toast.dismiss(entry.toastId);
    release([id]);
  }, [release]);

  const schedule = useCallback((request: DecisionRequest) => {
    if (queued.current.has(request.id)) return;
    hold([request.id]);
    const toastId = toast(`${request.verb} "${request.label}"`, {
      duration: delayMs,
      action: { label: 'Undo', onClick: () => undo(request.id) },
    });
    const timer = window.setTimeout(() => { void fire(request.id, false); }, delayMs);
    queued.current.set(request.id, { request, timer, toastId });
  }, [delayMs, fire, hold, undo]);

  const flushAll = useCallback((keepalive: boolean) => {
    for (const id of [...queued.current.keys()]) void fire(id, keepalive);
  }, [fire]);

  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'hidden') flushAll(true); };
    const onPageHide = () => flushAll(true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      flushAll(false);
    };
  }, [flushAll]);

  return { heldIds, schedule, undo, hold, release, flushAll };
};
