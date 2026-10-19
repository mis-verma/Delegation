import { cn } from '@/lib/utils';

interface LegendChipProps {
  color: string;
  label: string;
  line?: boolean;
  dash?: string;
  className?: string;
}

export const LegendChip = ({ color, label, line = false, dash, className }: LegendChipProps) => (
  <span
    className={cn(
      'inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-full border border-border/60 bg-surface px-2.5 sm:h-7 sm:px-3',
      className,
    )}
  >
    {line ? (
      <svg width="20" height="8" className="shrink-0" aria-hidden="true">
        <line x1="1" y1="4" x2="19" y2="4" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={dash} />
      </svg>
    ) : (
      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
    )}
    <span className="min-w-0 truncate t-meta font-display font-semibold text-text-secondary">{label}</span>
  </span>
);
