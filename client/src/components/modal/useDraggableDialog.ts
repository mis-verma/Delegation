import { useCallback, useRef, useState } from 'react';

interface DragPosition {
  top: number;
  left: number;
}

const DESKTOP_QUERY = '(min-width: 640px)';

const EDGE_MARGIN_PX = 56;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

interface DragStart {
  pointerX: number;
  pointerY: number;
  top: number;
  left: number;
}

export const useDraggableDialog = (open: boolean, enabled: boolean) => {
  const [position, setPosition] = useState<DragPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<DragStart | null>(null);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open && position) setPosition(null);
  }

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    if (!window.matchMedia(DESKTOP_QUERY).matches) return;
    if ((e.target as HTMLElement).closest('button, a, input, [role="button"]')) return;
    if (e.button !== 0) return;
    const node = contentRef.current;
    if (!node) return;

    const rect = node.getBoundingClientRect();
    dragStart.current = { pointerX: e.clientX, pointerY: e.clientY, top: rect.top, left: rect.left };
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
  }, [enabled]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    const node = contentRef.current;
    if (!start || !node) return;

    const rect = node.getBoundingClientRect();
    const nextLeft = clamp(start.left + (e.clientX - start.pointerX), EDGE_MARGIN_PX - rect.width, window.innerWidth - EDGE_MARGIN_PX);
    const nextTop = clamp(start.top + (e.clientY - start.pointerY), EDGE_MARGIN_PX - rect.height, window.innerHeight - EDGE_MARGIN_PX);

    setPosition({ top: nextTop, left: nextLeft });
  }, []);

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    dragStart.current = null;
    setIsDragging(false);
  }, []);

  return {
    contentRef,
    isDragging,
    style: enabled && position
      ? { position: 'fixed' as const, top: `${position.top}px`, left: `${position.left}px`, right: 'auto', bottom: 'auto', transform: 'none', translate: 'none', margin: 0 }
      : undefined,
    handleProps: enabled
      ? {
          onPointerDown,
          onPointerMove,
          onPointerUp: endDrag,
          onPointerCancel: endDrag,
        }
      : {},
  };
};
