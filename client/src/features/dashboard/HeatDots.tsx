import { cn } from '@/lib/utils';
import { formatPct } from '../../lib/percent';
import { heatLook } from '../../lib/heatScale';

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
        style={heatLook(v)}
        className={cn('flex h-5 min-w-5 flex-1 items-center justify-center rounded-md t-meta font-display font-bold leading-none sm:max-w-8', v === null && 'bg-surface-hover text-text-muted')}
      >
        <span aria-hidden="true" className="max-sm:hidden">{(labels[i] ?? '').slice(0, 1)}</span>
      </span>
    ))}
  </span>
);
