import { useEffect } from 'react';

const EDGE_PX = 22;
const TRIGGER_PX = 70;
const MAX_DRIFT_PX = 50;

const blocksSwipe = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest('[data-no-swipe-back], [role="dialog"], input, textarea, select');

export const useEdgeSwipeOpen = (enabled: boolean, onOpen: () => void) => {
  useEffect(() => {
    if (!enabled) return;
    let start: { x: number; y: number } | null = null;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      start = e.touches.length === 1 && t.clientX <= EDGE_PX && !blocksSwipe(e.target) ? { x: t.clientX, y: t.clientY } : null;
    };
    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = Math.abs(t.clientY - start.y);
      start = null;
      if (dx >= TRIGGER_PX && dy <= MAX_DRIFT_PX) onOpen();
    };
    const onCancel = () => { start = null; };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
    };
  }, [enabled, onOpen]);
};
