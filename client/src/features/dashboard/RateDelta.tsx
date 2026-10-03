import { memo } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { formatDelta } from './dashboardDisplay';

interface DeltaBadgeProps {
  /** Point change from pointDelta(); null (no data on either side) renders nothing. */
  delta: number | null;
  /** Plain-English baseline, e.g. 'vs last week'. Shown on hover and read by screen readers. */
  title: string;
  className?: string;
}

/**
 * A small "+4 pts" change badge. Higher is better for every rate it is used on, so up is green and
 * down is red; a change that rounds to zero is neutral and never shown as an improvement.
 */
export const DeltaBadge = memo(({ delta, title, className = '' }: DeltaBadgeProps) => {
  if (delta == null) return null;
  const isFlat = Math.round(delta) === 0;
  const Icon = isFlat ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  const tone = isFlat
    ? 'bg-surface text-text-muted border border-border/50'
    : delta > 0
      ? 'bg-success/10 text-success'
      : 'bg-danger/10 text-danger';
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-display font-bold tabular-nums whitespace-nowrap ${tone} ${className}`}
    >
      <Icon size={12} strokeWidth={2.75} aria-hidden="true" />
      {formatDelta(delta)}
      <span className="sr-only"> {title}</span>
    </span>
  );
});
DeltaBadge.displayName = 'DeltaBadge';
