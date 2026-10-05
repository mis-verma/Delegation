import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../../lib/useMediaQuery';

const DURATION_MS = 600;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

interface CountUpProps {
  value: number;
  /** How the running number is written. Defaults to thousands separators. */
  format?: (n: number) => string;
}

/**
 * A number that counts up (or down) to its new value instead of jumping. The very first value shows
 * straight away, so a page does not animate from 0 on every visit; only a change of value runs the
 * animation. Skipped completely for people who ask for reduced motion.
 */
export const CountUp = ({ value, format = (n) => n.toLocaleString() }: CountUpProps) => {
  const reduceMotion = usePrefersReducedMotion();
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (reduceMotion || !Number.isFinite(value)) return;
    const from = shownRef.current;
    if (from === value) return;
    const started = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / DURATION_MS);
      const next = Math.round(from + (value - from) * easeOutCubic(t));
      shownRef.current = next;
      setShown(next);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [value, reduceMotion]);

  // Reduced motion (or a value that is not a number): show the real value, no animation.
  return <>{format(reduceMotion || !Number.isFinite(value) ? value : shown)}</>;
};
