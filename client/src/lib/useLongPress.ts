import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';

interface LongPressOptions {
  delay?: number;
  moveTolerance?: number;
}

const FEEDBACK_AFTER_MS = 180;

export const useLongPress = (onLongPress: () => void, { delay = 550, moveTolerance = 10 }: LongPressOptions = {}) => {
  const timer = useRef<number | null>(null);
  const feedback = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const [pressing, setPressing] = useState(false);

  const stopTimers = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (feedback.current !== null) window.clearTimeout(feedback.current);
    timer.current = null;
    feedback.current = null;
  };

  const cancel = () => {
    stopTimers();
    origin.current = null;
    setPressing(false);
  };

  const trigger = () => {
    cancel();
    fired.current = true;
    onLongPress();
  };

  useEffect(() => stopTimers, []);

  return {
    pressing,
    handlers: {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (e.button !== 0 || !e.isPrimary || e.pointerType === 'mouse') return;
        fired.current = false;
        stopTimers();
        origin.current = { x: e.clientX, y: e.clientY };
        feedback.current = window.setTimeout(() => setPressing(true), FEEDBACK_AFTER_MS);
        timer.current = window.setTimeout(trigger, delay);
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        const start = origin.current;
        if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > moveTolerance) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      onContextMenu: (e: MouseEvent<HTMLElement>) => {
        if (origin.current === null && !fired.current) return;
        e.preventDefault();
        if (fired.current) return;
        trigger();
      },
      onClickCapture: (e: MouseEvent<HTMLElement>) => {
        if (!fired.current) return;
        fired.current = false;
        e.preventDefault();
        e.stopPropagation();
      },
    },
  };
};
