import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { useCloseOnBack } from '../../lib/useCloseOnBack';

interface ImageLightboxProps {
  src: string | null;
  onClose: () => void;
  images?: string[];
  onChange?: (src: string) => void;
}

interface View { scale: number; x: number; y: number }
interface Point { x: number; y: number }

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 280;
const TAP_SLOP_PX = 8;
const CLOSE_DRAG_PX = 96;
const SWIPE_PX = 80;
const BUTTON_STEP = 1.6;
const FIT: View = { scale: 1, x: 0, y: 0 };
const ZERO: Point = { x: 0, y: 0 };

const CONTROL_BUTTON =
  'flex size-11 items-center justify-center rounded-full text-white transition-colors duration-150 ease-out hover:bg-white/15 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white/60 [-webkit-tap-highlight-color:transparent]';

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const middle = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

const Viewer = ({ src, onClose, images, onChange }: { src: string; onClose: () => void; images?: string[]; onChange?: (src: string) => void }) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const viewRef = useRef<View>(FIT);
  const dragRef = useRef<Point>(ZERO);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ dist: number; mid: Point; view: View } | null>(null);
  const pan = useRef<{ start: Point; view: View } | null>(null);
  const tap = useRef<{ t: number; moved: boolean; backdrop: boolean } | null>(null);
  const lastTap = useRef<{ at: Point; t: number } | null>(null);
  const [view, setViewState] = useState<View>(FIT);
  const [drag, setDragState] = useState<Point>(ZERO);
  const [smooth, setSmooth] = useState(false);

  const setView = useCallback((next: View) => {
    viewRef.current = next;
    setViewState(next);
  }, []);

  const setDrag = useCallback((next: Point) => {
    dragRef.current = next;
    setDragState(next);
  }, []);

  const clampView = useCallback((v: View): View => {
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale));
    const stage = stageRef.current;
    const img = imgRef.current;
    if (scale <= MIN_SCALE) return FIT;
    if (!stage || !img) return { ...v, scale };
    const maxX = Math.max(0, (img.clientWidth * scale - stage.clientWidth) / 2);
    const maxY = Math.max(0, (img.clientHeight * scale - stage.clientHeight) / 2);
    return { scale, x: Math.min(maxX, Math.max(-maxX, v.x)), y: Math.min(maxY, Math.max(-maxY, v.y)) };
  }, []);

  const localPoint = useCallback((clientX: number, clientY: number): Point => {
    const rect = stageRef.current?.getBoundingClientRect();
    return rect ? { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 } : ZERO;
  }, []);

  const zoomTo = useCallback((nextScale: number, at: Point = ZERO, animate = true) => {
    const current = viewRef.current;
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
    const ratio = scale / current.scale;
    setSmooth(animate);
    setView(clampView({ scale, x: at.x - (at.x - current.x) * ratio, y: at.y - (at.y - current.y) * ratio }));
  }, [clampView, setView]);

  const index = images ? images.indexOf(src) : -1;
  const multiple = !!images && images.length > 1 && index >= 0;
  const go = useCallback((step: number) => {
    if (!images || !onChange || images.length < 2 || index < 0) return;
    const next = images[(index + step + images.length) % images.length];
    if (next) onChange(next);
  }, [images, onChange, index]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomTo(viewRef.current.scale * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), localPoint(e.clientX, e.clientY), false);
    };
    const block = (e: Event) => e.preventDefault();
    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('gesturestart', block);
    stage.addEventListener('gesturechange', block);
    return () => {
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('gesturestart', block);
      stage.removeEventListener('gesturechange', block);
    };
  }, [zoomTo, localPoint]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') zoomTo(viewRef.current.scale * BUTTON_STEP);
      else if (e.key === '-') zoomTo(viewRef.current.scale / BUTTON_STEP);
      else if (e.key === '0') zoomTo(1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomTo, go]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setSmooth(false);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.max(1, distance(a!, b!)), mid: localPoint(middle(a!, b!).x, middle(a!, b!).y), view: viewRef.current };
      pan.current = null;
      tap.current = null;
      return;
    }
    pan.current = { start: { x: e.clientX, y: e.clientY }, view: viewRef.current };
    tap.current = { t: Date.now(), moved: false, backdrop: e.target === e.currentTarget };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const p = pinch.current;
      const mid = middle(a!, b!);
      const next = localPoint(mid.x, mid.y);
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, p.view.scale * (distance(a!, b!) / p.dist)));
      const anchorX = (p.mid.x - p.view.x) / p.view.scale;
      const anchorY = (p.mid.y - p.view.y) / p.view.scale;
      setView(clampView({ scale, x: next.x - anchorX * scale, y: next.y - anchorY * scale }));
      return;
    }
    const p = pan.current;
    if (!p) return;
    const dx = e.clientX - p.start.x;
    const dy = e.clientY - p.start.y;
    if (tap.current && Math.hypot(dx, dy) > TAP_SLOP_PX) tap.current.moved = true;
    if (viewRef.current.scale > MIN_SCALE) {
      setView(clampView({ ...viewRef.current, x: p.view.x + dx, y: p.view.y + dy }));
    } else if (e.pointerType !== 'mouse' && tap.current?.moved) {
      setDrag(Math.abs(dx) > Math.abs(dy) && multiple ? { x: dx, y: 0 } : { x: 0, y: Math.max(0, dy) });
    }
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);

    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      if (viewRef.current.scale < 1.02) setView(FIT);
      const rest = [...pointers.current.values()][0];
      pan.current = rest ? { start: rest, view: viewRef.current } : null;
      tap.current = null;
      return;
    }

    const started = tap.current;
    const moved = dragRef.current;
    pan.current = null;
    tap.current = null;
    if (moved.x !== 0 || moved.y !== 0) {
      setSmooth(true);
      setDrag(ZERO);
      if (moved.y > CLOSE_DRAG_PX && moved.y > Math.abs(moved.x)) onClose();
      else if (Math.abs(moved.x) > SWIPE_PX) go(moved.x < 0 ? 1 : -1);
      return;
    }
    if (!started || started.moved) return;

    const now = Date.now();
    const at = localPoint(e.clientX, e.clientY);
    const previous = lastTap.current;
    if (previous && now - previous.t < DOUBLE_TAP_MS && distance(previous.at, at) < 32) {
      lastTap.current = null;
      if (viewRef.current.scale > 1.05) zoomTo(1);
      else zoomTo(DOUBLE_TAP_SCALE, at);
      return;
    }
    lastTap.current = { at, t: now };
    if (started.backdrop && viewRef.current.scale === MIN_SCALE) onClose();
  };

  const transform = `translate3d(${view.x + drag.x}px, ${view.y + drag.y}px, 0) scale(${view.scale})`;
  const percent = Math.round(view.scale * 100);

  return (
    <>
      <div
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        className="absolute inset-0 flex touch-none select-none items-center justify-center overflow-hidden overscroll-contain"
      >
        <img
          ref={imgRef}
          src={src}
          alt="Enlarged preview"
          draggable={false}
          style={{
            transform,
            transition: smooth ? 'transform 180ms ease-out' : 'none',
            opacity: drag.y > 0 ? 1 - Math.min(0.5, drag.y / 400) : 1,
            cursor: view.scale > MIN_SCALE ? 'grab' : 'zoom-in',
          }}
          className="max-h-full max-w-full object-contain will-change-transform"
        />
      </div>

      <div
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
        className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 px-3"
      >
        {multiple ? (
          <span className="pointer-events-auto rounded-full bg-black/60 px-3 py-2 t-meta font-display font-semibold tabular-nums text-white">
            {index + 1} of {images!.length}
          </span>
        ) : <span />}
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-black/60 p-0.5">
          <button type="button" aria-label="Zoom out" disabled={view.scale <= MIN_SCALE} onClick={() => zoomTo(viewRef.current.scale / BUTTON_STEP)} className={CONTROL_BUTTON}>
            <Minus size={18} aria-hidden="true" />
          </button>
          <span className="min-w-11 text-center t-meta font-display font-semibold tabular-nums text-white" aria-live="polite">{percent}%</span>
          <button type="button" aria-label="Zoom in" disabled={view.scale >= MAX_SCALE} onClick={() => zoomTo(viewRef.current.scale * BUTTON_STEP)} className={CONTROL_BUTTON}>
            <Plus size={18} aria-hidden="true" />
          </button>
          <button type="button" aria-label="Fit to screen" disabled={view.scale <= MIN_SCALE} onClick={() => zoomTo(1)} className={CONTROL_BUTTON}>
            <RotateCcw size={16} aria-hidden="true" />
          </button>
        </div>
        <DialogPrimitive.Close aria-label="Close image preview" className={`pointer-events-auto bg-black/60 ${CONTROL_BUTTON}`}>
          <X size={20} aria-hidden="true" />
        </DialogPrimitive.Close>
      </div>

      {multiple && (
        <>
          <button type="button" aria-label="Previous photo" onClick={() => go(-1)} className={`absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 ${CONTROL_BUTTON}`}>
            <ChevronLeft size={22} aria-hidden="true" />
          </button>
          <button type="button" aria-label="Next photo" onClick={() => go(1)} className={`absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 ${CONTROL_BUTTON}`}>
            <ChevronRight size={22} aria-hidden="true" />
          </button>
        </>
      )}
    </>
  );
};

export const ImageLightbox = ({ src, onClose, images, onChange }: ImageLightboxProps) => {
  const open = !!src;
  useCloseOnBack(open, onClose);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-black/90" />
        <DialogPrimitive.Content aria-label="Image preview" aria-describedby={undefined} className="fixed inset-0 z-[90] outline-none">
          <DialogPrimitive.Title className="sr-only">Image preview</DialogPrimitive.Title>
          {src && <Viewer key={src} src={src} onClose={onClose} images={images} onChange={onChange} />}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
