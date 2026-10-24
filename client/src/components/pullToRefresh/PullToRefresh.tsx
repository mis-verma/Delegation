import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type TouchEvent as ReactTouchEvent } from 'react';
import { haptic } from '../../lib/haptics';
import { SCROLL_TOP_EVENT, recalledScroll, rememberScroll } from '../../lib/appNav';
import { ArrowDown, Loader2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const PULL_THRESHOLD = 80;
const MAX_PULL = 120;
const HOLD_HEIGHT = 64;
const RESISTANCE = 0.5;
const SETTLE_MS = 280;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export interface PullToRefreshProps {
  onRefresh: () => Promise<unknown> | void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  scrollKey?: string;
}

export const PullToRefresh = ({ onRefresh, children, className, disabled, scrollKey }: PullToRefreshProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const puckRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);
  const touchStartY = useRef<number | null>(null);
  const pulling = useRef(false);
  const pull = useRef(0);
  const frame = useRef<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const paint = useCallback((value: number) => {
    pull.current = value;
    const progress = clamp01(value / PULL_THRESHOLD);
    const track = trackRef.current;
    if (track) {
      track.style.height = `${value}px`;
      track.style.opacity = `${progress}`;
    }
    if (puckRef.current) puckRef.current.style.transform = `scale(${0.8 + progress * 0.2})`;
    if (arrowRef.current) arrowRef.current.style.transform = `rotate(${progress * 180}deg)`;
  }, []);

  const settle = useCallback((to: number) => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    const from = pull.current;
    if (from === to) return;
    const start = performance.now();

    const step = (now: number) => {
      const t = clamp01((now - start) / SETTLE_MS);
      paint(from + (to - from) * easeOut(t));
      frame.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    frame.current = requestAnimationFrame(step);
  }, [paint]);

  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !scrollKey) return;
    const target = recalledScroll(scrollKey);
    el.scrollTop = target;
    if (target === 0) return;
    const retries = [120, 360, 800].map((ms) => window.setTimeout(() => {
      if (el.scrollTop !== target && el.scrollHeight - el.clientHeight >= target) el.scrollTop = target;
    }, ms));
    return () => retries.forEach((t) => window.clearTimeout(t));
  }, [scrollKey]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const toTop = () => el.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    window.addEventListener(SCROLL_TOP_EVENT, toTop);
    return () => window.removeEventListener(SCROLL_TOP_EVENT, toTop);
  }, []);

  const onScroll = () => {
    if (scrollKey && scrollRef.current) rememberScroll(scrollKey, scrollRef.current.scrollTop);
  };

  const onTouchStart = (e: ReactTouchEvent) => {
    if (disabled || refreshing) return;
    if ((scrollRef.current?.scrollTop ?? 0) > 0) return;
    touchStartY.current = e.touches[0].clientY;
    pulling.current = true;
  };

  const onTouchMove = (e: ReactTouchEvent) => {
    if (!pulling.current || touchStartY.current == null) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta <= 0 || (scrollRef.current?.scrollTop ?? 0) > 0) {
      pulling.current = false;
      paint(0);
      return;
    }
    e.preventDefault();
    paint(Math.min(delta * RESISTANCE, MAX_PULL));
  };

  const onTouchEnd = async () => {
    if (!pulling.current) return;
    pulling.current = false;
    touchStartY.current = null;

    if (pull.current >= PULL_THRESHOLD) {
      haptic('tap');
      setRefreshing(true);
      settle(HOLD_HEIGHT);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        settle(0);
      }
    } else {
      settle(0);
    }
  };

  return (
    <div
      ref={scrollRef}
      data-app-scroll=""
      className={cn("relative", className)}
      onScroll={onScroll}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div
        ref={trackRef}
        aria-hidden="true"
        style={{ height: 0, opacity: 0 }}
        className="pointer-events-none flex items-end justify-center overflow-hidden absolute top-0 left-0 right-0 z-50"
      >
        <div
          ref={puckRef}
          style={{ transform: 'scale(0.8)' }}
          className="flex items-center justify-center size-10 rounded-full bg-surface border border-border mb-4"
        >
          {refreshing ? (
            <Loader2 size={18} className="text-primary-600 animate-spin" strokeWidth={2.5} />
          ) : (
            <span ref={arrowRef} style={{ transform: 'rotate(0deg)' }} className="flex">
              <ArrowDown size={18} className="text-primary-600" strokeWidth={2.5} />
            </span>
          )}
        </div>
      </div>

      {children}
    </div>
  );
};
