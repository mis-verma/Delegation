import { useCallback, useRef, useState } from 'react';

interface DragPosition {
  top: number;
  left: number;
}

// Same breakpoint Tailwind's own `sm:` carries (unconfigured, so 640px is the real value the
// dialog's own `sm:` position classes switch on) — below it the dialog is a full-width bottom
// sheet (see DialogContent's mobile classes), where "dragging" the header would fight the sheet's
// own edge-to-edge position instead of repositioning anything a user would recognize as a window.
const DESKTOP_QUERY = '(min-width: 640px)';

// However far the drag has gone, this much of the dialog always stays on-screen — enough to grab
// it again and pull it back, so a dialog can never be dragged somewhere the user can't recover it.
const EDGE_MARGIN_PX = 56;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

interface DragStart {
  pointerX: number;
  pointerY: number;
  /** The dialog's own on-screen top-left corner at the moment the drag started, read straight off
   *  its live bounding box — not derived from Tailwind's `top:50%; left:50%; translate(-50%,-50%)`
   *  centering math, which this hook stopped trying to compose with (see the `style` return below). */
  top: number;
  left: number;
}

/**
 * Lets a dialog be repositioned by dragging its header. Once a drag actually moves it, the
 * dialog switches from Radix's percentage-based centering (`top:50%; left:50%`, plus a `-50%,-50%`
 * `translate-x-y` pair from DialogContent's own Tailwind classes) to plain absolute `top`/`left`
 * pixels this hook owns outright — see the `translate: 'none'` note on the returned `style` below
 * for why an inline `transform` override alone can't cancel that class-driven centering here.
 *
 * Desktop only (see DESKTOP_QUERY above) and off by default (`enabled`) — most dialogs in this
 * app are short, single-purpose forms with nothing behind them worth uncovering, so a caller has
 * to actually opt in rather than every dialog suddenly becoming a floating window.
 */
export const useDraggableDialog = (open: boolean, enabled: boolean) => {
  const [position, setPosition] = useState<DragPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<DragStart | null>(null);

  // A dialog that reopens in whatever spot it was dragged to last time reads as broken state, not
  // a remembered preference — nothing else in this app persists window position, so this doesn't
  // either. Adjusted during render (React's documented pattern for resetting state off a prop
  // change: https://react.dev/reference/react/useState#storing-information-from-previous-renders)
  // rather than in an effect, so the reset commits in the same render `open` flips true instead of
  // one tick later.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open && position) setPosition(null);
  }

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled) return;
    if (!window.matchMedia(DESKTOP_QUERY).matches) return;
    // Let the close button (or any future interactive control in the header) handle its own
    // click instead of starting a drag underneath it.
    if ((e.target as HTMLElement).closest('button, a, input, [role="button"]')) return;
    // Primary button / primary touch point only — a right-click or a second finger shouldn't
    // start dragging the dialog around.
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
    // Only takes over once a drag has actually moved the dialog — resting position stays exactly
    // what DialogContent's own classes already produce (including the untouched mobile sheet
    // layout below `sm:`) everywhere this hook isn't actively repositioning something.
    //
    // `translate: 'none'` alongside `transform: 'none'` — not redundant. This Tailwind build
    // compiles `translate-x-*`/`translate-y-*` (including the `sm:translate-x-[-50%]` centering
    // trick DialogContent's own classes use) to the standalone CSS `translate` property, not into
    // `transform`. The two are independent and compose together, so overriding only `transform`
    // left that class-driven `-50%,-50%` translate silently still in effect on top of these pixel
    // coordinates — confirmed by bisecting the class list against a plain test element until the
    // element actually moved where it was told to.
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
