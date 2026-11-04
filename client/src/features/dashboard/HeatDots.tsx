import { cn } from '@/lib/utils';
import { formatPct } from '../../lib/percent';
import { heatLook } from '../../lib/heatScale';

interface HeatDotsProps {
  values: (number | null)[];
  labels: string[];
  className?: string;
}

const dayText = (label: string | undefined, v: number | null) => `${label ?? ''}: ${v === null ? 'nothing due' : formatPct(v)}`;

export const HeatDots = ({ values, labels, className }: HeatDotsProps) => (
  <ol className={cn('flex items-center gap-1', className)} aria-label={`Last ${values.length} days`}>
    {values.map((v, i) => (
      <li
        key={i}
        title={dayText(labels[i], v)}
        style={heatLook(v)}
        className={cn('flex h-5 min-w-5 flex-1 items-center justify-center rounded-md t-meta font-display font-bold leading-none sm:max-w-8', v === null && 'bg-surface-hover text-text-muted')}
      >
        <span className="sr-only">{dayText(labels[i], v)}</span>
        <span aria-hidden="true" className="max-sm:hidden">{(labels[i] ?? '').slice(0, 1)}</span>
        {v === null && <span aria-hidden="true" className="sm:hidden">-</span>}
      </li>
    ))}
  </ol>
);
