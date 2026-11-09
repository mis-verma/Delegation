import { useCallback, useRef, useState, type TouchEvent } from 'react';

const CLOSE_PX = 60;
const FLICK_MIN_PX = 24;
const FLICK_PX_PER_MS = 0.5;
const LOCK_PX = 8;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const useSwipeToClose = (onClose?: () => void) => {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const axis = useRef<'x' | 'y' | null>(null);
  const [dragX, setDragX] = useState(0);

  const onTouchStart = useCallback((e: TouchEvent<HTMLElement>) => {
    const touch = e.touches[0];
    if (!touch || e.touches.length > 1) {
      start.current = null;
      return;
    }
    start.current = { x: touch.clientX, y: touch.clientY, t: Date.now() };
    axis.current = null;
  }, []);

  const onTouchMove = useCallback((e: TouchEvent<HTMLElement>) => {
    const from = start.current;
    const touch = e.touches[0];
    if (!from || !touch) return;
    const dx = touch.clientX - from.x;
    const dy = touch.clientY - from.y;
    if (axis.current === null) {
      if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (axis.current === 'x' && !prefersReducedMotion()) setDragX(Math.min(0, dx));
  }, []);

  const onTouchEnd = useCallback((e: TouchEvent<HTMLElement>) => {
    const from = start.current;
    const touch = e.changedTouches[0];
    start.current = null;
    const lockedX = axis.current === 'x';
    axis.current = null;
    setDragX(0);
    if (!from || !touch || !lockedX) return;
    const left = from.x - touch.clientX;
    const down = Math.abs(touch.clientY - from.y);
    const elapsed = Math.max(1, Date.now() - from.t);
    const flick = left > FLICK_MIN_PX && left / elapsed > FLICK_PX_PER_MS;
    if (left > down && (left > CLOSE_PX || flick)) onClose?.();
  }, [onClose]);

  const onTouchCancel = useCallback(() => {
    start.current = null;
    axis.current = null;
    setDragX(0);
  }, []);

  const dragStyle = dragX !== 0 ? { translate: `${dragX}px 0`, transition: 'none' } : undefined;

  return { dragStyle, handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel } };
};
