import { memo, useId } from 'react';
import { cn } from '@/lib/utils';

interface SparklineProps {
  values: readonly (number | null)[];
  tone: string;
  label: string;
  className?: string;
}

const W = 100;
const H = 28;
const PAD = 3;

export const Sparkline = memo(({ values, tone, label, className }: SparklineProps) => {
  const id = useId();
  const points = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v !== null);
  if (points.length < 2) return null;

  const max = Math.max(...points.map((p) => p.v), 1);
  const min = Math.min(...points.map((p) => p.v), 0);
  const span = max - min || 1;
  const step = W / (values.length - 1);
  const xy = points.map((p) => [p.i * step, H - PAD - ((p.v - min) / span) * (H - PAD * 2)] as const);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = xy[xy.length - 1];
  const area = `${xy[0][0].toFixed(1)},${H} ${line} ${last[0].toFixed(1)},${H}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} className={cn('h-7 w-full overflow-visible', tone, className)}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${id})`} />
      <polyline points={line} fill="none" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" stroke="currentColor" />
      <circle cx={last[0]} cy={last[1]} r="2" fill="currentColor" className="stroke-surface" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
});
Sparkline.displayName = 'Sparkline';
