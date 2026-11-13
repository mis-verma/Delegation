import { cn } from '@/lib/utils';
import { formatPct } from '../../../lib/percent';
import { fillTone, formatCount } from './fillCount';

interface FillCountCellProps {
  done: number | undefined;
  due: number | undefined;
  pct: number | null | undefined;
  unit?: string;
  note?: string;
  emptyTitle?: string;
}

const TRACK = 'h-1 w-full max-w-24 overflow-hidden rounded-full bg-border/60';

export const FillCountCell = ({ done, due, pct, unit, note, emptyTitle }: FillCountCellProps) => {
  if (done === undefined || due === undefined || due === 0 || pct == null) {
    return (
      <span className="flex flex-col items-end gap-1" title={emptyTitle}>
        <span className="t-card font-display font-semibold text-text-light">-</span>
        <span className={TRACK} aria-hidden="true" />
        {note && <span className="t-meta font-display text-text-muted whitespace-nowrap">{note}</span>}
      </span>
    );
  }
  const tone = fillTone(pct);
  const width = Math.max(0, Math.min(100, pct));
  return (
    <span className="flex flex-col items-end gap-1 tabular-nums">
      <span className={cn('t-card font-display font-bold leading-none whitespace-nowrap', tone.text)}>{formatPct(pct)}</span>
      <span className={TRACK} aria-hidden="true">
        <span className={cn('block h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none', tone.bar)} style={{ width: `${width}%` }} />
      </span>
      <span className="t-meta font-medium text-text-muted whitespace-nowrap">
        {formatCount(done)} of {formatCount(due)}{unit ? ` ${unit}` : ''}
      </span>
      {note && <span className="t-meta font-display text-text-muted whitespace-nowrap">{note}</span>}
    </span>
  );
};
