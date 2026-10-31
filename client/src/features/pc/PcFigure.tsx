import { cn } from '@/lib/utils';
import { Skeleton } from '../../components';

export type FigureTone = 'good' | 'bad' | 'plain';

const TONE_CLASS: Record<FigureTone, string> = {
  good: 'text-success',
  bad: 'text-danger',
  plain: 'text-text',
};

interface PcFigureProps {
  label: string;
  value: number;
  caption: string;
  tone: FigureTone;
  loading: boolean;
  onClick: () => void;
}

export const PcFigure = ({ label, value, caption, tone, loading, onClick }: PcFigureProps) => (
  <button
    type="button"
    onClick={onClick}
    className="flex min-h-11 min-w-0 cursor-pointer flex-col gap-1.5 rounded-lg border border-border/50 bg-surface-hover/30 p-3 text-left outline-none transition-colors duration-150 hover:border-border-hover active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40"
  >
    <span className="t-meta font-display font-semibold text-text-muted line-clamp-1">{label}</span>
    {loading ? (
      <Skeleton className="h-7 w-12" />
    ) : (
      <span className={cn('t-stat font-display font-bold leading-tight tabular-nums', TONE_CLASS[tone])}>{value}</span>
    )}
    <span className="t-meta text-text-muted line-clamp-1">{caption}</span>
  </button>
);
