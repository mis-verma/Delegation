import { cn } from '@/lib/utils';
import { formatPct } from '../../lib/percent';
import { TONE_COLOR, toneOf } from './scoreTone';

const heatTint = (v: number | null): string | undefined => {
  if (v === null) return undefined;
  const tone = toneOf(v);
  const strength = tone === 'success' ? 0.7 : tone === 'warning' ? 0.6 : 0.75;
  return `color-mix(in srgb, ${TONE_COLOR[tone]} ${Math.round(strength * 100)}%, transparent)`;
};

interface HeatDotsProps {
  values: (number | null)[];
  labels: string[];
  className?: string;
}

export const HeatDots = ({ values, labels, className }: HeatDotsProps) => (
  <span
    className={cn('flex items-center gap-1', className)}
    role="img"
    aria-label={`Last ${values.length} days: ${values.map((v, i) => `${labels[i] ?? ''} ${v === null ? 'nothing due' : formatPct(v)}`).join(', ')}`}
  >
    {values.map((v, i) => (
      <span
        key={i}
        title={`${labels[i] ?? ''}: ${v === null ? 'nothing due' : formatPct(v)}`}
        style={{ background: heatTint(v) }}
        className={cn('flex h-5 min-w-5 flex-1 items-center justify-center rounded-md t-meta font-display font-bold leading-none text-text sm:max-w-8', v === null && 'bg-surface-hover')}
      >
        <span aria-hidden="true" className="max-sm:hidden">{(labels[i] ?? '').slice(0, 1)}</span>
      </span>
    ))}
  </span>
);
