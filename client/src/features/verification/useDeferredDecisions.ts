import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '../../lib/queryHelpers';

// Approve and Send back take effect after a short Undo window: the row leaves the list right away,
// a toast offers Undo for ten seconds, and only then does the request go out. Anything still waiting
// is sent immediately when the page is left or hidden, so a decision is never lost.

export const UNDO_WINDOW_MS = 10_000;

export interface DecisionRequest {
  /** The run being decided. */
  id: string;
  /** Toast wording, e.g. "Approved" / "Sent back". */
  verb: string;
  /** Title shown in the toast. */
  label: string;
  /** Sends the decision. `keepalive` is true when the page is closing and the request must outlive it. */
  run: (options: { keepalive: boolean }) => Promise<unknown>;
}

interface Queued {
  request: DecisionRequest;
  timer: number;
  toastId: string | number;
}

interface Options {
  /** Runs once a decision was saved (refresh the lists). The row stays hidden until it resolves. */
  afterSaved?: () => Promise<unknown> | void;
  delayMs?: number;
}

export const useDeferredDecisions = ({ afterSaved, delayMs = UNDO_WINDOW_MS }: Options = {}) => {
  // Runs that were decided and are not back from the server yet (waiting out Undo, or being saved).
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
      // The decision is saved. A failed refresh must not read as a failed decision.
      try { await afterSavedRef.current?.(); } catch { /* the next refetch catches up */ }
    } catch (err) {
      toast.error(errorMessage(err, `Couldn't save that decision for ${entry.request.label}. It is back in the list.`));
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
    const onVisibility = () => { if (document.visibilityState === 'hidden') flushAll(false); };
    const onPageHide = () => flushAll(true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      // Leaving the page (route change or unmount): send whatever is still waiting out its Undo.
      flushAll(false);
    };
  }, [flushAll]);

  return { heldIds, schedule, undo, hold, release, flushAll };
};
