import { CircleHelp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CountUp } from '../../components/countUp';
import { Skeleton } from '../../components/skeleton';

export type FigureTone = 'good' | 'fair' | 'bad' | 'plain';

const TEXT: Record<FigureTone, string> = {
  good: 'text-success',
  fair: 'text-warning',
  bad: 'text-danger',
  plain: 'text-text',
};

const BAR: Record<FigureTone, string> = {
  good: 'bg-success',
  fair: 'bg-warning',
  bad: 'bg-danger',
  plain: 'bg-border-hover',
};

interface FigureCardProps {
  label: string;
  help: string;
  value: number | null;
  tone: FigureTone;
  bar: number | null;
  loading: boolean;
  format?: (n: number) => string;
  decimals?: number;
}

export const FigureCard = ({ label, help, value, tone, bar, loading, format, decimals = 0 }: FigureCardProps) => (
  <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border/50 bg-surface-hover/30 p-2.5">
    <span className="flex min-w-0 items-center gap-x-0.5 whitespace-nowrap t-meta text-text-muted">
      <span className="min-w-0 truncate">{label}</span>
      <span title={help} className="inline-flex shrink-0 text-text-light">
        <CircleHelp className="size-3.5" aria-hidden="true" />
        <span className="sr-only">{help}</span>
      </span>
    </span>
    {loading ? (
      <Skeleton className="h-7 w-14" />
    ) : (
      <span className={cn('t-stat font-display font-bold leading-tight tabular-nums', value === null ? 'text-text-light' : TEXT[tone])}>
        {value === null ? '-' : <CountUp value={value} decimals={decimals} format={format} fromZero />}
      </span>
    )}
    <span className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover" aria-hidden="true">
      <span
        className={cn('block h-full rounded-full transition-[width] duration-500 ease-out', value === null ? 'bg-border-hover' : BAR[tone])}
        style={{ width: `${loading || bar === null ? 0 : Math.max(4, Math.min(100, bar))}%` }}
      />
    </span>
  </div>
);
