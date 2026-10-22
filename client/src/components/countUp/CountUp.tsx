import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../../lib/useMediaQuery';

const DURATION_MS = 600;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

interface CountUpProps {
  value: number;
  format?: (n: number) => string;
  fromZero?: boolean;
}

export const CountUp = ({ value, format = (n) => n.toLocaleString(), fromZero = false }: CountUpProps) => {
  const reduceMotion = usePrefersReducedMotion();
  const [shown, setShown] = useState(fromZero ? 0 : value);
  const shownRef = useRef(fromZero ? 0 : value);
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

  return <>{format(reduceMotion || !Number.isFinite(value) ? value : shown)}</>;
};
