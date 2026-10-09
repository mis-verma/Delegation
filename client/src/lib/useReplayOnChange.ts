import { useEffect, useRef, type RefObject } from 'react';

/**
 * Plays a short fade and rise on `ref` whenever `trigger` changes within the same `scope` (the page), not on the
 * first render or a page change, where the page's own entrance already plays. It animates the node in place and never remounts it, so nothing inside loses
 * its state, which keying the page on the filter would. Skipped for people who ask for reduced motion.
 */
export const useReplayOnChange = (ref: RefObject<HTMLElement | null>, scope: string, trigger: string) => {
  const previous = useRef({ scope, trigger });
  useEffect(() => {
    const before = previous.current;
    previous.current = { scope, trigger };
    // A new page plays its own entrance; only a change inside the same page is replayed here.
    if (before.scope !== scope || before.trigger === trigger) return;
    const node = ref.current;
    if (!node || typeof node.animate !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    node.animate(
      [{ opacity: 0.35, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
      { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  }, [ref, scope, trigger]);
};
