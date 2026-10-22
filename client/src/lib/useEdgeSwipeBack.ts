import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { hasBackArrow, parentPath } from './appNav';

const EDGE_PX = 22;
const TRIGGER_PX = 80;
const MAX_DRIFT_PX = 50;

const blocksSwipe = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest('[data-no-swipe-back], [role="dialog"], input, textarea, select');

export const useEdgeSwipeBack = (enabled: boolean) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const canGoBack = hasBackArrow(pathname);

  useEffect(() => {
    if (!enabled || !canGoBack) return;
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
      if (dx < TRIGGER_PX || dy > MAX_DRIFT_PX) return;
      const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
      if (idx > 0) void navigate(-1);
      else void navigate(parentPath(pathname), { replace: true });
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
  }, [enabled, canGoBack, navigate, pathname]);
};
