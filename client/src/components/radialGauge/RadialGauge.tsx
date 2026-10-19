import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { usePrefersReducedMotion } from '../../lib/useMediaQuery';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface RadialGaugeProps {
  percent: number;
  size?: number;
  trackClassName?: string;
  gradientFrom?: string;
  gradientTo?: string;
  children?: ReactNode;
  className?: string;
  variant?: 'arc' | 'circle';
  thickness?: number;
  ticks?: number;
  showKnob?: boolean;
  ariaLabel?: string;
}

export const RadialGauge = ({
  percent,
  size = 220,
  trackClassName = 'text-border',
  gradientFrom = 'var(--color-primary-600, #4f46e5)',
  gradientTo = 'var(--color-primary-400, #818cf8)',
  children,
  className,
  variant = 'arc',
  thickness = 8,
  ticks = 0,
  showKnob = false,
  ariaLabel,
}: RadialGaugeProps) => {
  const baseId = useId().replace(/:/g, '');
  const gradientId = `${baseId}-gradient`;
  const isSolidColor = gradientFrom === gradientTo;

  const isCircle = variant === 'circle';
  const clampedPercent = Math.min(Math.max(percent, 0), 100);

  const [animatedPercent, setAnimatedPercent] = useState(clampedPercent);
  const fromRef = useRef(clampedPercent);
  const frameRef = useRef<number | null>(null);

  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (!isCircle) return;
    const from = fromRef.current;
    const to = clampedPercent;
    if (from === to) return;

    if (prefersReducedMotion) {
      fromRef.current = to;
      return;
    }

    const duration = 650;
    const startTime = performance.now();
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);

    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - (1 - t) ** 3;
      setAnimatedPercent(from + (to - from) * eased);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
        frameRef.current = null;
      }
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, [clampedPercent, isCircle, prefersReducedMotion]);

  const displayPercent = isCircle && !prefersReducedMotion ? animatedPercent : clampedPercent;

  const { trackLength, fillLength, circumference } = useMemo(() => {
    const radius = 40;
    const circ = 2 * Math.PI * radius;
    const track = (240 / 360) * circ;
    const fill = (displayPercent / 100) * track;

    return { circumference: circ, trackLength: track, fillLength: fill };
  }, [displayPercent]);

  const ringThickness = isCircle ? Math.round(size * 0.11) : thickness;

  return (
    <div
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      className={cn("relative shrink-0 flex items-center justify-center overflow-hidden", className)}
      style={{ width: size, height: size }}
    >
      {isCircle ? (
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              displayPercent <= 0
                ? `var(--color-border)`
                : `conic-gradient(from 0deg, ${gradientFrom} ${displayPercent}%, var(--color-border) ${displayPercent}% 100%)`,
            WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${ringThickness}px - 0.5px), #000 calc(100% - ${ringThickness}px + 0.5px))`,
            mask: `radial-gradient(farthest-side, transparent calc(100% - ${ringThickness}px - 0.5px), #000 calc(100% - ${ringThickness}px + 0.5px))`,
          }}
        />
      ) : (
        <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible">
          {!isSolidColor && (
            <defs>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style={{ stopColor: gradientFrom }} />
                <stop offset="100%" style={{ stopColor: gradientTo }} />
              </linearGradient>
            </defs>
          )}

          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="currentColor"
            className={trackClassName}
            strokeWidth={ringThickness}
            strokeLinecap="round"
            strokeDasharray={`${trackLength} ${circumference}`}
            style={{ transform: 'rotate(150deg)', transformOrigin: '50px 50px' }}
          />

          {percent > 0 && (
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              strokeWidth={ringThickness}
              strokeLinecap="round"
              strokeDasharray={`${fillLength} ${circumference}`}
              style={{
                transform: 'rotate(150deg)',
                transformOrigin: '50px 50px',
                stroke: isSolidColor ? gradientFrom : `url(#${gradientId})`,
              }}
              className="transition-all duration-1000 ease-[cubic-bezier(0.32,0.72,0,1)] origin-center"
            />
          )}

          {ticks > 0 && Array.from({ length: ticks + 1 }).map((_, i) => {
            const angle = ((150 + (240 * i) / ticks) * Math.PI) / 180;
            const r1 = 40 - ringThickness / 2 - 2.5;
            const r2 = r1 - (i % (ticks / 4) === 0 ? 4 : 2.2);
            return (
              <line
                key={i}
                x1={50 + r1 * Math.cos(angle)}
                y1={50 + r1 * Math.sin(angle)}
                x2={50 + r2 * Math.cos(angle)}
                y2={50 + r2 * Math.sin(angle)}
                stroke="currentColor"
                className={i % (ticks / 4) === 0 ? 'text-text-light' : 'text-border'}
                strokeWidth={i % (ticks / 4) === 0 ? 1.1 : 0.8}
                strokeLinecap="round"
              />
            );
          })}

          {showKnob && percent > 0 && (() => {
            const angle = ((150 + 240 * (displayPercent / 100)) * Math.PI) / 180;
            return (
              <circle
                cx={50 + 40 * Math.cos(angle)}
                cy={50 + 40 * Math.sin(angle)}
                r={ringThickness * 0.42}
                strokeWidth={ringThickness * 0.22}
                className="fill-surface transition-all duration-1000"
                style={{ stroke: gradientTo }}
              />
            );
          })()}
        </svg>
      )}

      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-2"
        style={{ paddingTop: isCircle ? 0 : size * (24 / 220) }}
      >
        {children}
      </div>
    </div>
  );
};