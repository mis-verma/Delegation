import { cn } from '@/lib/utils';
import { formatPctFixed, pctDigits, roundPct } from '../../../../lib/percent';
import { TONE_COLOR, toneOf } from './vivid';

const TWO_PI = 2 * Math.PI;

interface ArcProps {
  cx: number;
  radius: number;
  stroke: number;
  value: number | null;
  color: string;
}

const Arc = ({ cx, radius, stroke, value, color }: ArcProps) => {
  const length = TWO_PI * radius;
  const rounded = roundPct(value);
  return (
    <>
      <circle cx={cx} cy={cx} r={radius} fill="none" strokeWidth={stroke} stroke="var(--color-border)" />
      {rounded !== null && rounded > 0 && (
        <circle
          cx={cx}
          cy={cx}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={color}
          strokeDasharray={length}
          strokeDashoffset={length * (1 - rounded / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
        />
      )}
    </>
  );
};

interface ScoreRingProps {
  value: number | null;
  size?: number;
  stroke?: number;
  className?: string;
  label: string;
  showValue?: boolean;
  /** Overrides the colour the value would pick, so a ring can match the card it sits in. */
  color?: string;
}

export const ScoreRing = ({ value, size = 64, stroke = 7, className, label, showValue = true, color }: ScoreRingProps) => {
  // The number grows with the ring, so a bigger ring is a clearer one rather than a roomier one.
  const figure = size >= 64 ? 't-card' : 't-meta';
  return (
    <span
      role="img"
      aria-label={`${label}: ${pctDigits(value) === null ? 'nothing due' : formatPctFixed(value)}`}
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <Arc cx={size / 2} radius={(size - stroke) / 2} stroke={stroke} value={value} color={color ?? TONE_COLOR[toneOf(value)]} />
      </svg>
      {showValue && (
        <span aria-hidden="true" className={cn('absolute inset-0 flex items-center justify-center font-display font-extrabold tabular-nums text-text', figure)}>
          {pctDigits(value) ?? 'N/A'}
        </span>
      )}
    </span>
  );
};

export interface ConcentricValue {
  key: string;
  label: string;
  value: number | null;
  color: string;
}

export const ConcentricRings = ({ values, size = 56, stroke = 5 }: { values: readonly ConcentricValue[]; size?: number; stroke?: number }) => {
  const gap = 2;
  const spoken = values.map((v) => `${v.label} ${roundPct(v.value) === null ? 'nothing due' : formatPctFixed(v.value)}`).join(', ');
  return (
    <span role="img" aria-label={spoken} className="inline-flex shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        {values.map((v, i) => (
          <Arc key={v.key} cx={size / 2} radius={(size - stroke) / 2 - i * (stroke + gap)} stroke={stroke} value={v.value} color={v.color} />
        ))}
      </svg>
    </span>
  );
};
