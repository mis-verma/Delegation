import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SemiGaugeProps {
  percent: number;
  showFill?: boolean;
  gradientFrom?: string;
  gradientTo?: string;
  children?: ReactNode;
  className?: string;
  ariaLabel?: string;
  endLabels?: boolean;
}

const ARC = 'M 15 100 A 85 85 0 0 1 185 100';
const TICKS = 10;

export const SemiGauge = ({
  percent,
  showFill = true,
  gradientFrom = 'var(--color-primary-400)',
  gradientTo = 'var(--color-primary-700)',
  children,
  className,
  ariaLabel,
  endLabels = true,
}: SemiGaugeProps) => {
  const gradientId = `${useId().replace(/:/g, '')}-semi`;
  const clamped = Math.min(Math.max(percent, 0), 100);
  const filled = showFill && clamped > 0;

  return (
    <div role={ariaLabel ? 'img' : undefined} aria-label={ariaLabel} className={cn('relative w-full', className)}>
      <svg viewBox="0 0 200 108" className="w-full h-auto block overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: gradientFrom }} />
            <stop offset="100%" style={{ stopColor: gradientTo }} />
          </linearGradient>
        </defs>

        {Array.from({ length: TICKS + 1 }).map((_, i) => {
          const angle = Math.PI - (Math.PI * i) / TICKS;
          const major = i % (TICKS / 2) === 0;
          const r1 = 70;
          const r2 = major ? 63 : 66;
          return (
            <line
              key={i}
              x1={100 + r1 * Math.cos(angle)}
              y1={100 - r1 * Math.sin(angle)}
              x2={100 + r2 * Math.cos(angle)}
              y2={100 - r2 * Math.sin(angle)}
              stroke="currentColor"
              className={major ? 'text-text-light' : 'text-border-hover'}
              strokeWidth={major ? 1.4 : 1}
              strokeLinecap="round"
            />
          );
        })}

        <path d={ARC} fill="none" stroke="currentColor" className="text-border" strokeWidth={13} strokeLinecap="round" />

        {filled && (
          <path
            d={ARC}
            pathLength={100}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={13}
            strokeLinecap="round"
            strokeDasharray="100"
            strokeDashoffset={100 - clamped}
            className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
          />
        )}

        {filled && (
          <g
            style={{ transform: `rotate(${1.8 * clamped}deg)`, transformOrigin: '100px 100px' }}
            className="transition-transform duration-700 ease-out motion-reduce:transition-none"
          >
            <circle cx="15" cy="100" r="5.6" className="fill-surface" style={{ stroke: gradientTo }} strokeWidth={2.4} />
          </g>
        )}

        {endLabels && (
          <>
            <text x="44" y="97" textAnchor="middle" className="fill-text-light" fontSize="7" fontWeight="600">0</text>
            <text x="156" y="97" textAnchor="middle" className="fill-text-light" fontSize="7" fontWeight="600">100</text>
          </>
        )}
      </svg>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-end gap-1.5 pb-[3%]">{children}</div>
    </div>
  );
};
