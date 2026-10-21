import { useRef, type ReactNode, type TouchEvent } from 'react';
import { cn } from '@/lib/utils';
import { haptic } from '../../lib/haptics';

const TRIGGER_PX = 96;
const LOCK_PX = 12;

interface SwipeAction {
  label: string;
  icon: ReactNode;
  tone: 'success' | 'danger';
  onTrigger: () => void;
}

interface SwipeRowProps {
  right?: SwipeAction;
  left?: SwipeAction;
  className?: string;
  children: ReactNode;
}

const HINT_TONE = { success: 'bg-success/15 text-success', danger: 'bg-danger/15 text-danger' } as const;

export const SwipeRow = ({ right, left, className, children }: SwipeRowProps) => {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const rightHintRef = useRef<HTMLDivElement>(null);
  const leftHintRef = useRef<HTMLDivElement>(null);
  const gesture = useRef({ x: 0, y: 0, dx: 0, axis: null as 'x' | 'y' | null, armed: false });

  const paint = (dx: number) => {
    if (surfaceRef.current) surfaceRef.current.style.transform = dx ? `translateX(${dx}px)` : '';
    if (rightHintRef.current) rightHintRef.current.style.opacity = dx > 0 ? String(Math.min(1, dx / TRIGGER_PX)) : '0';
    if (leftHintRef.current) leftHintRef.current.style.opacity = dx < 0 ? String(Math.min(1, -dx / TRIGGER_PX)) : '0';
  };

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    gesture.current = { x: t.clientX, y: t.clientY, dx: 0, axis: null, armed: true };
  };

  const onTouchMove = (e: TouchEvent) => {
    const g = gesture.current;
    if (!g.armed) return;
    const t = e.touches[0];
    const dx = t.clientX - g.x;
    const dy = t.clientY - g.y;
    if (g.axis === null && (Math.abs(dx) > LOCK_PX || Math.abs(dy) > LOCK_PX)) g.axis = Math.abs(dx) > Math.abs(dy) * 1.5 ? 'x' : 'y';
    if (g.axis !== 'x') return;
    const allowed = (dx > 0 && right) || (dx < 0 && left) ? dx : 0;
    g.dx = allowed;
    paint(allowed);
  };

  const onTouchEnd = () => {
    const { axis, dx } = gesture.current;
    gesture.current = { x: 0, y: 0, dx: 0, axis: null, armed: false };
    if (axis !== 'x') return;
    paint(0);
    if (dx >= TRIGGER_PX && right) { haptic('tap'); right.onTrigger(); }
    else if (dx <= -TRIGGER_PX && left) { haptic('tap'); left.onTrigger(); }
  };

  return (
    <div className={cn('relative rounded-2xl', className)}>
      {right && (
        <div ref={rightHintRef} aria-hidden="true" className={cn('absolute inset-0 flex items-center justify-start gap-2 rounded-2xl pl-4 t-meta font-display font-semibold opacity-0 sm:hidden', HINT_TONE[right.tone])}>
          {right.icon}{right.label}
        </div>
      )}
      {left && (
        <div ref={leftHintRef} aria-hidden="true" className={cn('absolute inset-0 flex items-center justify-end gap-2 rounded-2xl pr-4 t-meta font-display font-semibold opacity-0 sm:hidden', HINT_TONE[left.tone])}>
          {left.label}{left.icon}
        </div>
      )}
      <div ref={surfaceRef} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd} className="relative touch-pan-y">
        {children}
      </div>
    </div>
  );
};
