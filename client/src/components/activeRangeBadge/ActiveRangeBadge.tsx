import { Calendar } from 'lucide-react';

interface ActiveRangeBadgeProps {
  from?: string;
  to?: string;
  emptyLabel?: string;
}

const formatShort = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export const ActiveRangeBadge = ({ from, to, emptyLabel = 'All time' }: ActiveRangeBadgeProps) => (
  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-surface-hover/60 text-[0.6875rem] font-display font-medium text-text-muted shrink-0">
    <Calendar size={12} className="text-text-light shrink-0" />
    {from && to ? `${formatShort(from)} – ${formatShort(to)}` : emptyLabel}
  </span>
);
