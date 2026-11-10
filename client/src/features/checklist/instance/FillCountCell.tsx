import { cn } from '@/lib/utils';
import { formatPct } from '../../../lib/percent';
import { rateToneClass } from '../checklistDisplay';
import { formatCount } from './fillCount';

interface FillCountCellProps {
  done: number | undefined;
  due: number | undefined;
  pct: number | null | undefined;
  unit?: string;
  note?: string;
  emptyTitle?: string;
}

export const FillCountCell = ({ done, due, pct, unit, note, emptyTitle }: FillCountCellProps) => {
  if (done === undefined || due === undefined || due === 0 || pct == null) {
    return (
      <span className="flex flex-col items-end gap-0.5">
        <span className="t-card font-display font-semibold text-text-light" title={emptyTitle}>-</span>
        {note && <span className="t-meta font-display text-text-muted whitespace-nowrap">{note}</span>}
      </span>
    );
  }
  const tone = rateToneClass(pct);
  return (
    <span className="flex flex-col items-end gap-0.5 tabular-nums">
      <span className="t-card font-display font-bold text-text whitespace-nowrap">
        {formatCount(done)}
        <span className="font-semibold text-text-muted"> / {formatCount(due)}</span>
      </span>
      <span className={cn('t-meta font-display font-semibold whitespace-nowrap', tone)}>
        {formatPct(pct)}{unit ? <span className="font-medium text-text-muted"> {unit}</span> : null}
      </span>
      {note && <span className="t-meta font-display text-text-muted whitespace-nowrap">{note}</span>}
    </span>
  );
};
