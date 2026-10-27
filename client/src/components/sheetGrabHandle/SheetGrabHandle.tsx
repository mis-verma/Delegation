import { useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { haptic } from '../../lib/haptics';

const CLOSE_PX = 96;
const FLICK_PX_PER_MS = 0.5;
const MIN_FLICK_PX = 40;

interface SheetGrabHandleProps {
  targetRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}

export const SheetGrabHandle = ({ targetRef, onClose }: SheetGrabHandleProps) => {
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);

  const start = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !targetRef.current) return;
    drag.current = { y: e.clientY, t: performance.now(), dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    targetRef.current.style.transition = 'none';
  };

  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const node = targetRef.current;
    if (!d || !node) return;
    d.dy = Math.max(0, e.clientY - d.y);
    node.style.transform = `translateY(${d.dy}px)`;
  };

  const end = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const node = targetRef.current;
    if (!d || !node) return;
    const fast = d.dy > MIN_FLICK_PX && d.dy / Math.max(1, performance.now() - d.t) > FLICK_PX_PER_MS;
    if (d.dy > CLOSE_PX || fast) {
      haptic('tap');
      onClose();
      return;
    }
    node.style.transition = 'transform 200ms ease-out';
    node.style.transform = '';
  };

  return (
    <div className="relative h-4 shrink-0 md:hidden" aria-hidden="true">
      <span className="mx-auto mt-2 block h-1.5 w-10 rounded-full bg-border-hover" />
      <div
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        className="absolute inset-x-16 top-0 z-10 h-11 touch-none cursor-grab active:cursor-grabbing"
      />
    </div>
  );
};
