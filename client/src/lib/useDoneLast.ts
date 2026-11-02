import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const SETTLE_MS = 450;

interface HasId {
  id: string;
}

const snapshot = <T extends HasId>(items: readonly T[], isDone: (item: T) => boolean): Map<string, boolean> =>
  new Map(items.map((i) => [i.id, isDone(i)]));

export const findJustDone = <T extends HasId>(
  previous: ReadonlyMap<string, boolean>,
  items: readonly T[],
  isDone: (item: T) => boolean,
): string[] => items.filter((i) => isDone(i) && previous.get(i.id) === false).map((i) => i.id);

export const useDoneLast = <T extends HasId>(items: readonly T[], isDone: (item: T) => boolean, isHeld?: (id: string) => boolean) => {
  const known = useRef<Map<string, boolean>>(snapshot(items, isDone));
  const timers = useRef<Map<string, number>>(new Map());
  const heldRef = useRef(isHeld);
  const [settling, setSettling] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    heldRef.current = isHeld;
  }, [isHeld]);

  const arm = useCallback(function arm(id: string) {
    window.clearTimeout(timers.current.get(id));
    timers.current.set(id, window.setTimeout(() => {
      timers.current.delete(id);
      if (heldRef.current?.(id)) {
        arm(id);
        return;
      }
      setSettling((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, SETTLE_MS));
  }, []);

  useEffect(() => {
    const flipped = findJustDone(known.current, items, isDone);
    known.current = snapshot(items, isDone);
    if (flipped.length === 0) return;
    setSettling((prev) => new Set([...prev, ...flipped]));
    for (const id of flipped) arm(id);
  }, [items, isDone, arm]);

  useEffect(() => {
    const live = timers.current;
    return () => {
      for (const t of live.values()) window.clearTimeout(t);
      live.clear();
    };
  }, []);

  return useMemo(() => {
    const pending = items.filter((i) => !isDone(i) || settling.has(i.id));
    const done = items.filter((i) => isDone(i) && !settling.has(i.id));
    return { pending, done, settling };
  }, [items, settling, isDone]);
};
