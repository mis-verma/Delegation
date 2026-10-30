import { useEffect, useMemo, useRef, useState } from 'react';

const SETTLE_MS = 600;

interface HasId {
  id: string;
}

export const useDoneLast = <T extends HasId>(items: readonly T[], isDone: (item: T) => boolean) => {
  const knownDone = useRef<Set<string>>(new Set(items.filter((i) => isDone(i)).map((i) => i.id)));
  const timers = useRef<Map<string, number>>(new Map());
  const [settling, setSettling] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    const nowDone = new Set(items.filter((i) => isDone(i)).map((i) => i.id));
    const flipped = [...nowDone].filter((id) => !knownDone.current.has(id));
    knownDone.current = nowDone;
    if (flipped.length === 0) return;
    setSettling((prev) => new Set([...prev, ...flipped]));
    for (const id of flipped) {
      window.clearTimeout(timers.current.get(id));
      timers.current.set(id, window.setTimeout(() => {
        timers.current.delete(id);
        setSettling((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, SETTLE_MS));
    }
  }, [items, isDone]);

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
